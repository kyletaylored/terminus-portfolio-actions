#!/usr/local/bin/node
const { execSync } = require('child_process')
const ObjectsToCsv = require('objects-to-csv')
const { getSites, getDomains } = require('./utils.js')

// Utilities
const org = process.argv[2] !== undefined ? process.argv[2] : process.env['ORG']
console.log({ org })

// Get upstreams.
const upstreamFields = 'ID,Machine Name'
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
  sitePromises.push(getSites(id, mac, org))
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
    }
  }
  // Wait for domains for finish processing
  Promise.all(domainPromises).then(async (domains) => {
    const csv = new ObjectsToCsv(domains)
    const fileName = `/tmp/${org} Site Inventory.csv`

    // Save to file:
    await csv.toDisk(fileName).then((r) => {
      console.log(`Domain file: ${fileName}`)
    })

    // Return the CSV file as string:
    // console.log(await csv.toString())
  })
})
