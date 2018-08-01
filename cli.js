const program = require("commander");
const fetch = require("node-fetch");
let config;
const delay = ms => new Promise(r => setTimeout(r, ms));

program
  .version("0.0.0")
  .option("-c, --config <path>")
  .command("create <name>")
  .option("-i, --id <orgId>", "Organization id")
  .action(async (name, options) => {
    setConfig(options);
    const { org } = options;
    if (!org) {
      const { orgId, message } = await createOrganization(name);
      if (!orgId) {
        console.error("No organization was created. Server said:", message);
        process.exit(1);
      }
      org = orgId;
    }

    await createDataSource(name, org);
  });

program.command("delete <name>").action(async (name, options) => {
  setConfig(options);
  //queryGrapahana('/api/org')
  const { id } = await getOrgByName(name);
  console.log(`Are you sure you want to delete ${name} with id ${id} (y/N)`);
  const input = await askOnce();
  if (input === "y") {
    console.log(await queryGrapahana(`/api/orgs/${id}`, null, "DELETE"));
  }
  process.exit(0)
});

program.parse(process.argv);

function setConfig(options) {
  const {
    parent: { config: configPath }
  } = options;
  console.log("Generating ", options, configPath);

  config = require(configPath);
  if (!config) {
    console.error(`Could not find config at ${configPath}`);
  }
}

async function createOrganization(name) {
  start(`Creating Organization`);
  const result = await queryGrapahana("/api/orgs", { name });
  console.log("Created org", result);
  done("Creating Organization");
  return result;
}

async function createDataSource(name, orgId) {
  start("Create Datastore");
  const request = {
    name: `${name}'_ds`,
    orgId: `${orgId}`,
    database: `cus_${name}`,
    ...config.grapaha.datasource
  };

  let count = 0;
  let success = false;
  while (count < 5 && !success) {
    await delay(1000 * count);
    const result = await queryGrapahana("/api/datasources", request);
    console.log(`Created graphana datasource with id ${result.id}`);
    console.log(result);
    const { message } = await queryGrapahana(`/api/datasources/${result.id}`);
    console.log("message", message);
    success = message !== "Not Found" && message !== "Permission denied";
    if (!success) {
      console.log(
        `Datasource not created.  ${count < 5 ? "Trying again" : ""}`
      );
    }
    count++;
  }
  if (success) {
    console.log("Created datasource");
  } else {
    console.log("Failed to create datasource");
  }
  done("Create DS");
}

async function getOrgByName(name) {
  return await queryGrapahana(`/api/orgs/name/${name}`);
}
//async function queryGraphana(path, )

async function queryGrapahana(path, body, method) {
  const { graphana: gConfig } = config;
  const url = `http://${gConfig.username}:${gConfig.password}@${
    gConfig.url
  }${path}`;
  const response = await fetch(url, {
    body: body && JSON.stringify(body),
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json"
    }
  });
  return await response.json();
}

function start(name) {
  console.log(`================= ${name} ==================`);
}
function done(name) {
  console.log(`================= done (${name})`);
}

function askOnce() {
  var stdin = process.stdin,
    stdout = process.stdout;

  stdin.resume();
  stdout.write(": ");

  return new Promise(res => {
    stdin.once("data", function(data) {
      console.log("dara", data.toString());
      res(data.toString().trim());
    });
  });
}
