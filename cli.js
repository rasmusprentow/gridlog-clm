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
    let { org } = options;
    if (!org) {
      const { orgId, message } = await createOrganization(name);
      if (!orgId) {
        console.error("No organization was created. Server said:", message);
        process.exit(1);
      }
      org = orgId;
    }
    await changeActiveOrg(org);
    await createDataSource(name, org);
  });

program.command("delete <name>").action(async (name, options) => {
  setConfig(options);
  const { id } = await getOrgByName(name);
  const input = await askOnce(`Are you sure you want to delete ${name} with id ${id} (y/N)`);
  if (input === "y") {
    console.log(await queryGrapahana(`/api/orgs/${id}`, null, "DELETE"));
  }
  process.exit(0)
});

program.command("keys").action(async (ignore, options) => {
    setConfig(options);
    const keys = await queryGrapahana('/api/auth/keys');
    console.log('All api keys:')
    console.log(keys);
    while (true) {
        const input = await askOnce('Enter id to delete (enter to continue)')
        if(!input) {
            break; 
        }
        console.log(await queryGrapahana(`/api/auth/keys/${input}`, null, "DELETE"));
    }
    const answer = await askOnce('Create new key (y/N)?')
    if(answer.toLowerCase() === 'y') {
        const name = await askOnce('Enter key name')
        console.log('Creating new admin key')
        console.log(await queryGrapahana('/api/auth/keys', {name, role: 'Admin'}));
    }
    process.exit(0)
})

program.command('test').action(async (options) => {
    setConfig(options)
    await changeActiveOrg(1)
})

program.parse(process.argv);

function setConfig(options) {
  const {
    parent: { config: configPath }
  } = options;
  config = require(configPath);
  if (!config) {
    console.error(`Could not find config at ${configPath}`);
  }
}

async function changeActiveOrg(orgId) {
    await queryGrapahana(`/api/user/using/${orgId}`, null, "POST");
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
    name: `${name}_ds`,
    orgId: `${orgId}`,
    database: `cus_${name}`,
    ...config.graphana.datasource
  };

  let count = 0;
  let success = false;
  while (count < 5 && !success) {
    await delay(1000 * count);
    const result = await queryGrapahana("/api/datasources", request);
    console.log(`Created graphana datasource with id ${result.id}`);
    console.log(result);
    const  response  = await queryGrapahana(`/api/datasources/${result.id}`);
    console.log("Checking if DS exist", response);
    success = response.message !== "Not Found" && response.message !== "Permission denied";
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

function askOnce(question) {
  var stdin = process.stdin,
    stdout = process.stdout;

  stdin.resume();
  stdout.write(`${question}: `);

  return new Promise(res => {
    stdin.once("data", function(data) {
      res(data.toString().trim());
    });
  });
}
