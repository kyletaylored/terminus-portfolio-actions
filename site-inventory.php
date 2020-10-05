<?php

require_once 'vendor/autoload.php';

use Parallel\Exceptions\InvalidBinaryException;
use Parallel\Wrapper;

// Declare some variables.
$ORG = getenv('ORG');
$FIELDS = "ID,Name,Plan,Framework,Owner,Created";
$UPSTREAM_FIELDS = "ID,Machine Name";
$site_fields = "${FIELDS},Upstream";
$domain_fields = "${site_fields},Domains";


// Shell requirements
$parallel_bin = exec('which parallel');
$terminus = exec('which terminus');
$tmp_json = "/tmp/json";


// Get upstreams.
exec("${terminus} org:upstream:list \"${ORG}\" --format json --fields \"${UPSTREAM_FIELDS}\" > ${tmp_json}");
$custom = json_decode(file_get_contents($tmp_json), true);
exec("${terminus} upstream:list --filter type=core --format json --fields \"${UPSTREAM_FIELDS}\" > ${tmp_json}");
$core = json_decode(file_get_contents($tmp_json), true);
$upstreams = array_merge($custom, $core);


// Get users
exec("${terminus} org:people:list \"${ORG}\" --format json > ${tmp_json}");
$users = json_decode(file_get_contents($tmp_json), true);

/**
 *
 * Running commands on the local host
 *
 */

// You can initialize the Wrapper with or without parameters
$parallel = new Wrapper();

try {
  // Set path to binary
  $parallel->initBinary($parallel_bin);

  // Add the commands you want to run in parallel
  foreach ($upstreams as $upstream) {
    $UPSTREAM_ID = $upstream['id'];
    $MAC = $upstream['machine_name'];

    echo "Getting sites for ${MAC}";
    exec("${terminus} org:site:list \"${ORG}\" --format json --upstream \"${UPSTREAM_ID}\" --fields \"${FIELDS}\" > ${tmp_json}");
    $parallel->addCommand('/path/to/command/one.sh');
  }


  /**
   * Setting the parallelism to 0 or "auto" will
   * result in a parallelism setting equal to the
   * number of commands you whish to run
   *
   * Use the maxParallelism setting to set a cap
   */
  $parallel->setParallelism('auto');
  $parallel->setMaxParallelism(10);

  // Run the commands and catch the output from the console
  // $output = $parallel->run();
} catch (InvalidBinaryException $exception) {
  // The binary file does not exist, or is not executable
}
