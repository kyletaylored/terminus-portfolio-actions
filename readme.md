Small helper script for auditing an organization portfolio on Pantheon using Terminus.

```
# Install node dependencies (just one for CSV output)
npm i

# Either export the org ID as a shell variable... 
export ORG="ORG_UUID"
node site-inventory.js

# ...or pass it in as an argument
node site-inventory.js ORG_UUID
```