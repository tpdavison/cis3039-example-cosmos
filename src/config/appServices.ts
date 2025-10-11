import { ListProductsDeps } from '../app/list-products';
import { ProductRepo } from '../domain/product-repo';
import { CosmosProductRepo } from '../infra/cosmos-product-repo';

const COSMOS_OPTIONS = {
  endpoint: 'https://shopping-dev-ab47-cosmos-uksouth.documents.azure.com:443/',
  databaseId: 'catalogue-db',
  containerId: 'products',
  key: process.env.COSMOS_KEY,
};

let cachedProductRepo: ProductRepo | null = null;

export const getProductRepo = (): ProductRepo => {
  if (!cachedProductRepo) {
    cachedProductRepo = new CosmosProductRepo(COSMOS_OPTIONS);
  }
  return cachedProductRepo;
};

export const createListProductsDeps = (): ListProductsDeps => ({
  productRepo: getProductRepo(),
});
