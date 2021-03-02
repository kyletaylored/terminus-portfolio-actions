#!/usr/local/bin/node
const fs = require('fs')
const { execSync } = require('child_process')
const { getSites, processLogs } = require('./utils.js')
const { promisify } = require('util')

// Utilities
const org = process.argv[2] !== undefined ? process.argv[2] : process.env['ORG']
console.log({ org })
const env = 'live'

// Get upstreams.
const upstreamFields = 'ID,Machine Name'
const customUpstream = JSON.parse(execSync(`terminus org:upstream:list "${org}" --format json --fields "${upstreamFields}"`))
const coreUpstream = JSON.parse(execSync(`terminus upstream:list --filter type=core --format json --fields "${upstreamFields}"`))
const upstreams = Object.assign({}, customUpstream, coreUpstream)

// Assign promises for sites
let sitePromises = []
for (upstream in upstreams) {
  let id = upstreams[upstream].id
  let mac = upstreams[upstream].machine_name
  sitePromises.push(getSites(id, mac, org))
}

// Start looping through sites.
Promise.all(sitePromises).then((sites) => {
  logPromises = []
  for (upstream in sites) {
    let up = sites[upstream]
    // Loop through each individual site
    if (up !== undefined || up.length > 0) {
      for (s in up) {
        let site = up[s]
        if (site.plan_name !== 'Sandbox' && site.frozen === false) {
          logPromises.push(processLogs(site, env))
        }
      }
    }
  }
  // Process all logs.
  Promise.all(logPromises).then(async (logs) => {
    console.log(logs)
  })
})
