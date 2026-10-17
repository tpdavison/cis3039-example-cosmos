import type { ListProductsDeps } from '../app/list-products';
import type { UpsertProductDeps } from '../app/upsert-product';
import type { ProductRepo } from '../domain/product-repo';
import { CosmosProductRepo } from '../infra/cosmos-product-repo';

// Week 4 demonstration target: replace these values with your provisioned
// Cosmos account endpoint, database and container names. The container uses /id.
export const getCosmosTarget = () => ({
  endpoint: 'https://YOUR_COSMOS_ENDPOINT_HERE',
  databaseId: 'catalogue-db',
  containerId: 'products',
});

let cachedProductRepo: ProductRepo | null = null;

export const getProductRepo = (): ProductRepo => {
  if (!cachedProductRepo) {
    const key = process.env.COSMOS_KEY;
    if (!key || key.trim() === '') {
      throw new Error(
        'COSMOS_KEY must be set to a non-empty Cosmos DB account key.',
      );
    }

    const { endpoint, databaseId, containerId } = getCosmosTarget();
    // todo: the cosmos options should be validated here

    cachedProductRepo = new CosmosProductRepo({
      endpoint,
      databaseId,
      containerId,
      key,
    });
  }
  return cachedProductRepo;
};

export const createListProductsDeps = (): ListProductsDeps => ({
  productRepo: getProductRepo(),
});

export const createUpsertProductDeps = (): UpsertProductDeps => ({
  productRepo: getProductRepo(),
  now: () => new Date(),
});
