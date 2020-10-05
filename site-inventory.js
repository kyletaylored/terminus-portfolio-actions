#!/usr/local/bin/node
const { exec, execSync } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)
const ObjectsToCsv = require('objects-to-csv')

// Utilities
const org = process.argv[2] !== undefined ? process.argv[2] : process.env['ORG']
const fields = 'ID,Name,Plan,Framework,Owner,Created'
const upstreamFields = 'ID,Machine Name'

console.log({ org })
/**
 * Get a list of sites for each upstream.
 * @param {String} id
 * @param {String} machine_name
 */
const getSites = async (id, machine_name) => {
  console.log(`Searching for sites in ${machine_name}...`)
  let cmd = `terminus org:site:list "${org}" --format json --fields "${fields}" --upstream "${id}"`
  let resp = await execPromise(cmd)
  let sites = JSON.parse(resp.stdout)
  for (site in sites) {
    sites[site].upstream = machine_name
    sites[site].owner = await getSiteOwner(sites[site])
  }
  return sites
}

/**
 * Get site owner.
 * @param {Object} site
 */
const getSiteOwner = async (site) => {
  const owner = site.owner
  const id = site.id
  if (Object.keys(owners).includes(owner)) {
    return owners[owner].email
  } else {
    // Need to look up site owner.
    let cmd = `terminus site:team:list --format=json "${id}"`
    let resp = await execPromise(cmd)
    let team = JSON.parse(resp.stdout)
    // Update global owners
    Object.assign(owners, team)
    return owners[owner].email
  }
}

/**
 * Get custom domains for each site
 * @param {Object} site
 */
const getDomains = async (site) => {
  const id = site.id
  const name = site.name
  const siteId = `${id}.live`
  console.log(`Searching for domains in ${name}...`)
  const cmd = `terminus domain:list "${siteId}" --format json --filter type=custom`
  const resp = await execPromise(cmd)
  const domains = JSON.parse(resp.stdout)
  site.custom_domains = Object.keys(domains).join(', ')
  return site
}

// Get upstreams.
const customUpstream = JSON.parse(execSync(`terminus org:upstream:list "${org}" --format json --fields "${upstreamFields}"`))
const coreUpstream = JSON.parse(execSync(`terminus upstream:list --filter type=core --format json --fields "${upstreamFields}"`))
const upstreams = Object.assign({}, customUpstream, coreUpstream)

// Get owners
let owners = JSON.parse(execSync(`terminus org:people:list "${org}" --format json`))

// Assign promises for sites
let sitePromises = []
for (upstream in upstreams) {
  let id = upstreams[upstream].id
  let mac = upstreams[upstream].machine_name
  sitePromises.push(getSites(id, mac))
}

// Start looping through sites.
Promise.all(sitePromises).then((sites) => {
  domainPromises = []
  for (upstream in sites) {
    let up = sites[upstream]
    // Get domains
    if (up !== undefined || up.length > 0) {
      for (s in up) {
        let site = up[s]
        domainPromises.push(getDomains(site))
      }

      // Wait for domains for finish processing
      Promise.all(domainPromises).then(async (domains) => {
        const csv = new ObjectsToCsv(domains)

        // Save to file:
        let fileName = `/tmp/${org} Site Inventory.csv`
        await csv.toDisk(fileName).then((r) => {
          console.log(`Domain file: ${fileName}`)
        })

        // Return the CSV file as string:
        // console.log(await csv.toString())
      })
    }
  }
})
