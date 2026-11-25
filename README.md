# Product persistence example

A TypeScript service built with Azure Functions and Azure Cosmos DB for NoSQL. It uses a repository port to keep Product rules and use cases independent of storage. Run the domain and in-memory demos first, then use a disposable Cosmos database with the local HTTP host. You can also publish the same service to Azure.

## What this example demonstrates

### Keep business rules independent of technology

The code uses a clean architecture with ports and adapters. The [domain](src/domain/product.ts) defines a Product and its validation rules without importing Azure or HTTP types. The [application use cases](src/app/) coordinate listing and saving Products through the [`ProductRepo` interface](src/domain/product-repo.ts), the storage port. They do not construct a database client or decide HTTP status codes.

The [infrastructure adapters](src/infra/) implement that port. The [HTTP handlers](src/functions/) parse requests and map application results to responses. The [composition root](src/config/composition-root.ts) selects the adapter, supplies configuration and assembles dependencies. It also supplies the clock used by the upsert use case, so the application does not have to obtain the current time itself.

This is dependency injection: callers supply what a use case needs through its dependency parameter. Follow a GET from `list-products-http.ts` through `createListProductsDeps()` and `listProducts()` to `productRepo.list()`. The use case knows the repository contract; the composition root knows which implementation to provide.

### Use the same port with different adapters

Both adapters implement `getById`, `list`, `save` and `delete`. A missing lookup returns `null`, `save` creates or replaces by ID, and deleting an absent Product is a no-op.

| Behaviour | `FakeProductRepo` | `CosmosProductRepo` |
| --- | --- | --- |
| Storage | An in-memory `Map` in one process | Documents in an Azure Cosmos DB container |
| Lifetime | Data is lost when the process ends; separate processes have separate stores | Data survives application restarts and can be read by another process |
| Setup | No Azure resources or credentials | Account, database, container and matching account key |
| Data boundary | Copies Products and their mutable dates on input and output | Maps domain dates to stored strings and validates documents through the Product factory when reading |

The fake supports development and isolated checks without a live database. The Cosmos adapter connects the same application contract to persistent storage. Compare the two modes of `demo:list`: the use case stays the same while the caller supplies a different repository. The HTTP service and seed runner use Cosmos; the fake demo constructs its own repository directly. Caching the Cosmos adapter reuses a client within a process; Cosmos itself provides persistence.

### Handle validation and unexpected failures at different boundaries

The Product factory returns `success: false` with field-level `issues` for invalid domain values. The upsert use case passes those expected validation issues back to its caller. Successful results carry `data`; operational failures such as storage or authentication errors reject promises instead of becoming validation results.

The HTTP handlers translate those outcomes into the public API contract. Malformed JSON, invalid request shapes and invalid Product values produce HTTP 400. Successful reads and writes produce HTTP 200. Unexpected configuration, repository or response-mapping failures are caught at the HTTP boundary and produce HTTP 500 with `Internal server error`, without exposing exception details to the client. Invalid data already stored in Cosmos is an unexpected failure, rather than a bad request from the current caller.

The standalone demos expose domain and application behaviour without the HTTP host. They provide manual observations, not an automated test suite. Together, the layers let you change storage technology or add an entry point while retaining the core rules and use cases.

## Development environment

Use VS Code with Docker and the Dev Containers extension. Start by cloning the repository.

```bash
git clone https://github.com/tpdavison/cis3039-example-cosmos.git
```

Open the cloned folder in VS Code and choose **Dev Containers: Reopen in Container** from the Command Palette. Run the remaining commands in Bash from the repository root inside the container.

For course work, create your own empty **private** GitHub repository with a name of your choice, such as `week4-product-practice`. Leave the README, licence and `.gitignore` options unselected. Copy its HTTPS URL and replace the placeholder URL below:

```bash
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_PRIVATE_REPOSITORY.git
git remote -v
git branch --show-current
```

Check that both `origin` entries point to your private repository and the current branch is `main`. Correct any mismatch before pushing the existing history:

```bash
git push -u origin main
```

Refresh your repository in GitHub and confirm that the example files are present. Keep the cloned history rather than initialising a new Git history. If you already have your own private copy, continue there. This practice repository is separate from your assessment implementation.

The supplied container includes Node.js 22, npm, Azure Functions Core Tools 4 and Azure CLI. For Cosmos or hosted deployment you also need an active Azure subscription and permission to create the resources in a supported region.

## Build and run the standalone demos

```bash
npm ci
npm run build
```

`npm ci` restores the locked dependencies. The TypeScript build compiles both `src/` and `scripts/` into `dist/`. To check types without emitting files, run `npm run typecheck`.

```bash
npm run demo:domain
npm run demo:list -- fake
```

- The domain demo prints `Created Product with a 101-character name:` on the supplied code. Open [the demo](scripts/demo-domain.ts) and [the Product factory](src/domain/product.ts) to trace the call. Invalid input returns `success: false` and an `issues` array. The demo prints each issue’s field and message.
- The list demo prints `Adapter: FakeProductRepo` and a success result containing `demo-product-1`. It constructs the fake directly and passes it to the list use case. Each run starts with a fresh sample.

These demos run without Azure credentials. `npm test` is a placeholder.

## Provision a Cosmos DB target

Use a resource group dedicated to this example. Serverless Cosmos DB charges for requests and retained storage. Skip creation if you already have a disposable account, database and container with the settings below. Inspect that target before using it.

```bash
az login
az account list --query "[].{name:name,Id:id,isDefault:isDefault}" --output table
```

Choose your subscription, then confirm that it is selected.

```bash
az account set --subscription "YOUR_SUBSCRIPTION_ID"
az account show --query '{name:name,Id:id}' --output table
```

Replace the placeholders in each command with your recorded values. Use your chosen short lowercase letters/digits identifier in the suggested names.

| Placeholder | Value |
| --- | --- |
| `YOUR_RESOURCE_GROUP` | `week4-lab-YOUR_UID-rg` |
| `YOUR_COSMOS_ACCOUNT` | `week4-lab-YOUR_UID-cosmos` or another globally unique Cosmos account name |
| `YOUR_REGION` | A region supported by Cosmos DB and permitted by your subscription |
| Database ID | `catalogue-db` |
| Container ID | `products` |
| Partition key path | `/id` |

Run each creation command after the previous one succeeds. Account creation can take several minutes.

```bash
az group create --name "YOUR_RESOURCE_GROUP" --location "YOUR_REGION" --output none
```

```bash
az cosmosdb create --resource-group "YOUR_RESOURCE_GROUP" --name "YOUR_COSMOS_ACCOUNT" \
  --kind GlobalDocumentDB --locations regionName="YOUR_REGION" failoverPriority=0 isZoneRedundant=False \
  --capabilities EnableServerless --default-consistency-level Session --output none
```

```bash
az cosmosdb sql database create --resource-group "YOUR_RESOURCE_GROUP" \
  --account-name "YOUR_COSMOS_ACCOUNT" --name catalogue-db --output none
```

```bash
az cosmosdb sql container create --resource-group "YOUR_RESOURCE_GROUP" \
  --account-name "YOUR_COSMOS_ACCOUNT" --database-name catalogue-db \
  --name products --partition-key-path '/id' --output none
```

Inspect the new or reused target. Record the endpoint and check for `EnableServerless`, the intended region, account-key authentication enabled (`keyAuthDisabled` is not `true`), and the `/id` partition path.

```bash
az cosmosdb show --resource-group "YOUR_RESOURCE_GROUP" --name "YOUR_COSMOS_ACCOUNT" \
  --query '{endpoint:documentEndpoint,capabilities:capabilities[].name,locations:locations[].locationName,keyAuthDisabled:disableLocalAuth}' \
  --output json
az cosmosdb sql container show --resource-group "YOUR_RESOURCE_GROUP" \
  --account-name "YOUR_COSMOS_ACCOUNT" --database-name catalogue-db --name products \
  --query '{id:resource.id,partitionKey:resource.partitionKey.paths}' --output json
```

## Configure, seed and read the database

Open [the composition root](src/config/composition-root.ts). In `getCosmosTarget()`, replace the full `endpoint` value with the endpoint you recorded, including `https://`. Confirm `databaseId` is `catalogue-db` and `containerId` is `products`. These three values are in the source for this example. The key comes from the process environment.

Retrieve the key without displaying it. Use this terminal for seeding, the Cosmos list demo and the local Functions host. Stop if retrieval or the non-empty check fails. Keep the key out of source, settings files, Git commits, screenshots and logs. Repeat the retrieval when you open a new terminal for those commands.

```bash
COSMOS_KEY="$(az cosmosdb keys list --resource-group "YOUR_RESOURCE_GROUP" \
  --name "YOUR_COSMOS_ACCOUNT" --type keys --query primaryMasterKey --output tsv)"
export COSMOS_KEY
test -n "$COSMOS_KEY"
```

Before seeding, verify that the values in `getCosmosTarget()` name your disposable target.

```bash
npm run seed
```

The seed prints its target, writes `widget-001`, `widget-002` and `widget-003`, then prints `Completed seeding products.` If the target and IDs match, read them back through the Cosmos adapter.

```bash
npm run demo:list -- cosmos
```

The list demo prints `Adapter: CosmosProductRepo` and a success result containing those IDs. Run it again without reseeding to see the same records from a new process.

In the Azure portal, open the Cosmos account’s **Data Explorer**, then **catalogue-db → products → Items**. Set only the name of `widget-001` to `Widget Deluxe — portal edit` and save. Run the Cosmos list demo again to see the edited name. Keep the edit for the HTTP checks.

The seed upserts the three fixed IDs and retains unrelated items. Rerunning it replaces the portal-edited name with the fixture value. Writes are sequential, so some records may already have been saved if a run fails partway through.

## Run the HTTP service locally

Copy the supplied settings template if `local.settings.json` is missing. If it exists, keep it and confirm that `Values.FUNCTIONS_WORKER_RUNTIME` is `node`. The template leaves local function storage blank for this HTTP example. Git ignores the local file.

```bash
cp local.settings.template.json local.settings.json
```

In the terminal with `COSMOS_KEY`, start the host. The start command cleans and rebuilds the project.

```bash
npm start
```

Look for `listProductsHttp` and `upsertProductHttp`. Use the port reported by the host if it differs from `7071`. Open the GET URL in a browser or run curl from a second terminal.

```bash
curl -i http://localhost:7071/api/products
```

Expect HTTP 200 and a JSON array containing the three seeded IDs and the edited name. Product prices are integer pence and `updatedAt` is an ISO date string. Stop the host with Ctrl+C, run `npm start` again in the same terminal, then repeat the GET without reseeding. The same Cosmos data should appear.

### Try the write endpoint

`POST` and `PUT` on `/api/products` both create or replace a Product by ID. Use the samples against your disposable database. The service supplies `updatedAt`.

```bash
curl -i -H 'Content-Type: application/json' --data-binary @samples/product-post.json \
  http://localhost:7071/api/products
curl -i -H 'Content-Type: application/json' --data-binary @samples/product-post-invalid.json \
  http://localhost:7071/api/products
```

Expect HTTP 200 and the saved `product-123` from the first request, and HTTP 400 with a price-validation message from the second. A further GET includes the saved Product. Repeating the valid request replaces that Product’s stored values.

## Publish to Azure (optional)

For a hosted demonstration, create a Windows Consumption Function App running Node.js 22 in the same disposable resource group. The app uses the seeded Cosmos target from `getCosmosTarget()`. Its separate Azure Storage account holds Functions host data. Hosting, storage and monitoring can incur charges.

Both HTTP routes allow anonymous access, including the write route. **Clean up after use is essential to avoid unexpected costs.** Delete the demonstration Azure resources when you finish, following [Clean up](#clean-up). Stopping the local host or closing VS Code does not remove Azure resources or end their charges.

Use a globally unique Function App name such as `week4-lab-YOUR_UID-func` and a globally unique Storage account name such as `week4labab47funcstore`, with 3–24 lowercase letters or digits. Use the region you recorded earlier. If provisioning fails, check the selected subscription and the region named in the error.

```bash
az storage account create \
  --name "YOUR_FUNCTION_STORAGE" \
  --resource-group "YOUR_RESOURCE_GROUP" \
  --location "YOUR_REGION" \
  --sku Standard_LRS \
  --output none
```

After the Storage account is ready, create the Function App.

```bash
az functionapp create \
  --name "YOUR_FUNCTION_APP" \
  --resource-group "YOUR_RESOURCE_GROUP" \
  --storage-account "YOUR_FUNCTION_STORAGE" \
  --consumption-plan-location "YOUR_REGION" \
  --os-type Windows \
  --runtime node \
  --runtime-version 22 \
  --functions-version 4 \
  --https-only true \
  --output none
```

### Set the Cosmos key and publish

Use the terminal holding `COSMOS_KEY` for the same account that `getCosmosTarget()` names. If you have resumed in a new terminal, retrieve and check the key again. The following command stores it as an Azure application setting and suppresses the settings response.

```bash
az functionapp config appsettings set --resource-group "YOUR_RESOURCE_GROUP" \
  --name "YOUR_FUNCTION_APP" --settings "COSMOS_KEY=$COSMOS_KEY" --output none
```

In the Dev Container, check that you have created `local.settings.json` from the supplied template as described in [Run the HTTP service locally](#run-the-http-service-locally). Local settings are excluded by [`.funcignore`](.funcignore). Type-check and build from the repository root. The Functions entry point is `dist/src/functions/*.js`.

```bash
npm run typecheck
npm run build
```

Publish after both commands succeed.

```bash
func azure functionapp publish "YOUR_FUNCTION_APP"
```

Find the actual assigned hostname and substitute it into the GET request.

```bash
az functionapp show --resource-group "YOUR_RESOURCE_GROUP" --name "YOUR_FUNCTION_APP" \
  --query defaultHostName --output tsv
```

```bash
curl -i "https://YOUR_FUNCTION_HOSTNAME/api/products"
```

Expect HTTP 200 and the Products from the same disposable Cosmos container, including the portal-edited name if you made that edit. You can use the same sample requests against the HTTPS URL. Rebuild and publish again if you change the code or the target values in `getCosmosTarget()`.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Restore or build fails | Run `node --version` and `npm --version` in the Dev Container. Use Node.js 22 and the supplied lockfile. |
| Local host fails to start | Run `func --version` and check for Core Tools 4. Confirm the working directory contains `host.json` and the local settings file has the Node worker configured. |
| Cosmos creation fails | Confirm the selected subscription and region. Check the Azure error for provider registration, policy or availability restrictions before retrying. |
| Seed, list or HTTP returns an error | Check the endpoint, database and container against the intended target. For a local run, verify that the starting shell holds the key. For Azure, check that the app has the `COSMOS_KEY` setting for the deployed target. HTTP 500 returns `Internal server error`. The Cosmos list demo can show the underlying error locally. |

## Clean up

Stop the local host with Ctrl+C. When you have finished all checks, verify the selected subscription, group and its resource list before deleting anything. If the group contains assessment, shared or unrelated resources, leave the group intact and remove only the disposable resources you own.

```bash
az account show --query '{name:name,Id:id}' --output table
az group show --name "YOUR_RESOURCE_GROUP" --query '{name:name,Id:id,location:location}' --output table
az resource list --resource-group "YOUR_RESOURCE_GROUP" --query '[].{name:name,Type:type}' --output table
```

Delete the group only if the entire group is disposable. Read the confirmation prompt.

```bash
az group delete --name "YOUR_RESOURCE_GROUP"
```

After deletion completes, verify that the group no longer exists. Expect `false`.

```bash
az group exists --name "YOUR_RESOURCE_GROUP"
```

Clear the key from this terminal when you finish.

```bash
unset COSMOS_KEY
```

## Source layout

| Location | Responsibility |
| --- | --- |
| [`src/domain/`](src/domain/) | Product rules and the `ProductRepo` storage contract |
| [`src/app/`](src/app/) | List and upsert use cases with injected dependencies |
| [`src/config/composition-root.ts`](src/config/composition-root.ts) | Builds and caches the Cosmos adapter for the service and seed |
| [`src/infra/`](src/infra/) | Cosmos and in-memory adapters. The Cosmos adapter maps dates to and from stored strings. |
| [`src/functions/`](src/functions/) | HTTP handlers that translate requests and responses |
| [`scripts/`](scripts/) | Standalone demos, seed runner and seed fixtures |

The sample uses full-list reads and unconditional upserts for a small dataset. Choose access controls, query patterns and concurrency rules appropriate to your own service.
