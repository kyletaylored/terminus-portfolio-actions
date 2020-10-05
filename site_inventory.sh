#!/bin/bash

# Nestle MSE needs to regularly compile lists of the sites that are on the platform,
# including: Site name, site ID, Upstream and the domains attached to the site.

# Only need Organization ID to start.
ORG=$1
FIELDS="ID,Name,Plan,Framework,Owner,Created"
UPSTREAM_FIELDS="ID,Machine Name,Name"
SITE_FIELDS="${FIELDS},Upstream"
DOMAIN_FIELDS="${SITE_FIELDS},Domains"

# Create blank CSVs
echo $SITE_FIELDS > /tmp/sites.csv
echo $DOMAIN_FIELDS > /tmp/domains.csv  

# Define some functions
join_str() { 
  local IFS="$1"; shift; echo "$*"
}

# Get custom domains for each site
get_domains() {
  local DATA=$1
  IFS=', ' read -r -a array <<< "${DATA}"
  local SITE="${array[0]}.live"
  local DOMAINS=$(join_str , $(terminus domain:list "${SITE}" --format list --filter type=custom))
  echo "${DATA},\"${DOMAINS}\"" >> /tmp/domains.csv
}

get_sites() {
  local UPSTREAM_ID=$1
  loca UPSTREAM_NAME=$2
  echo "Getting sites for ${UPSTREAM_NAME}"
  terminus org:site:list "${ORG}" --format json --upstream "${UPSTREAM_ID}" --fields "${FIELDS}"
  echo ${JSON_OUT} $(cat /tmp/sites.json) | jq -s add > /tmp/sites.json
}

# Export all functions
export -f get_domains
export -f join_str
export -f get_sites

# Get list of upstreams (custom and managed)
CUSTOM=$(terminus org:upstream:list "${ORG}" --format json --fields "${UPSTREAM_FIELDS}" | jq '. | to_entries')
CORE=$(terminus upstream:list --filter type=core --format json --fields "${UPSTREAM_FIELDS}" | jq '. | to_entries')
echo ${CUSTOM} ${CORE} | jq -s add > /tmp/upstreams.json
# jq -n "$UPSTREAMS"

jq -c '.[].value' /tmp/upstreams.json | while read i; do
    # do stuff with $i
    id=$(jq -r '.id' <<< $i)
    label=$(jq -r '.label' <<< $i)
    get_sites ${id} ${label} &
    sleep 2
done

exit

# Loop through upstreams
for k in $(jq -n "${UPSTREAMS}" | jq -c '. | to_entries | .[].value'); do
  jq -n $k '.value.label'
  # get_sites ${UPSTREAM} &
  sleep 2
done

wait
exit

# Loop through upstreams to fetch all sites
while IFS=, read -r I D
do
  get_sites "${I}" "${D}" &
  sleep 2
done < /tmp/upstreams.csv

wait # Wait for all background processes
exit
# Parallelize fetching domains from sites
parallel --jobs 50 get_domains {} < /tmp/sites.csv

# Hope this works
cat /tmp/domains.csv