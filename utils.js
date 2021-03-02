const { exec, execSync } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)
const dig = require('node-dig-dns')
const mergeFiles = require('merge-files')
const fs = require('fs')

/**
 * Get a list of sites for each upstream.
 * @param {String} id
 * @param {String} machine_name
 */
exports.getSites = async (id, machine_name, org) => {
  console.log(`Searching for sites in ${machine_name}...`)
  let cmd = `terminus org:site:list "${org}" --format json --upstream "${id}"`
  let resp = await execPromise(cmd)
  let sites = JSON.parse(resp.stdout)
  for (site in sites) {
    sites[site].upstream = machine_name
    // sites[site].owner = await getSiteOwner(sites[site])
  }
  return sites
}

/**
 * Get site owner.
 * @param {Object} site
 */
exports.getSiteOwner = async (site) => {
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
    return owners[owner].email !== undefined ? owners[owner].email : ''
  }
}

/**
 * Get custom domains for each site
 * @param {Object} site
 */
exports.getDomains = async (site) => {
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

/**
 * Get appserver IP addresses based on site ID.
 * @param {string} id
 * @param {string} env
 */
exports.getContainerIps = async (id, env) => {
  const uri = `appserver.${env}.${id}.drush.in`
  let ips = await dig([uri])
    .then((result) => {
      let ipaddr = result.answer.map((i) => i.value)
      return ipaddr
    })
    .catch((err) => {
      console.log('Error:', err)
    })

  return ips
}

/**
 * Rsync app server logs.
 * @param {string} ip Appserver IP address
 * @param {string} id Target site UUID
 * @param {string} env Target site environment
 */
exports.getAppLogs = async function (ip, id, env) {
  // Create directory, then rsync files
  execSync(`mkdir -p logs/${id}/${ip}`)
  execSync(`rsync -zabuP -e 'ssh -p 2222 -oStrictHostKeyChecking=no' ${env}.${id}@appserver.${env}.${id}.drush.in:logs/* logs/${id}/${ip}`)
}

/**
 * Rsync db server logs.
 * @param {string} ip Database server IP address
 * @param {string} id Target site UUID
 * @param {string} env Target site environment
 */
exports.getDbLogs = async function (ip, id, env) {
  // Create directory, then rsync files
  execSync(`mkdir -p logs/${id}/${ip}`)
  execSync(`rsync -zabuP -e 'ssh -p 2222 -oStrictHostKeyChecking=no' ${env}.${id}@dbserver.${env}.${id}.drush.in:logs/* logs/${id}/${ip}`)
}

/**
 * Merge common log files from different app containers.
 * @param {string} id Site ID
 * @param {array} ips Appserver IP addresses
 */
exports.mergeLogs = async function (id, ips) {
  // Use for cleanup
  const folders = ['nginx', 'php']

  // Establish files
  const files = {
    'error.log': 'nginx/error.log',
    'nginx-access.log': 'nginx/nginx-access.log',
    'nginx-error.log': 'nginx/nginx-error.log',
    'php-error.log': 'php/php-error.log',
    'php-fpm-error.log': 'php/php-fpm-error.log',
    'php-slow.log': 'php/php-slow.log',
    'newrelic.log': 'php/newrelic.log',
    'mysqld-slow-query.log': 'mysqld-slow-query.log',
    'mysqld.log': 'mysqld.log',
  }

  // Base status
  let status = false

  // Loop through files
  for (let dest in files) {
    let source = files[dest]
    let inputPaths = []
    const outputPath = `logs/${id}/${dest}`

    // Loop through each IP
    for (let i = 0; i < ips.length; i++) {
      const ip = ips[i]
      let path = `logs/${id}/${ip}/${source}`
      if (fs.existsSync(path)) {
        inputPaths.push(path)
      }
    }

    console.log(inputPaths)
    status = await mergeFiles(inputPaths, outputPath)
    console.log(`${outputPath}: ${status}`)
  }

  // Remove old log folders.
  for (let f = 0; f < folders.length; f++) {
    const folder = folders[f]
    for (let i = 0; i < ips.length; i++) {
      const ip = ips[i]
      exec(`rm -rf logs/${id}/${ip}`)
    }
  }
}

/**
 *
 * @param {object} site The Site object
 * @param {string} env Target environment
 */
exports.processLogs = async function (site, env) {
  let ips = await exports.getContainerIps(site.id, env)

  // Extract logs
  ips.forEach((ip) => {
    exports.getAppLogs(ip, site.id, env)
    exports.getDbLogs(ip, site.id, env)
  })

  // Merge log files
  await exports.mergeLogs(site.id, ips)
  return site
}
