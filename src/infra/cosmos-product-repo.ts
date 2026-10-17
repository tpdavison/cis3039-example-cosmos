import { CosmosClient, ErrorResponse, type Container } from '@azure/cosmos';
import { createProduct, type Product } from '../domain/product';
import type { ProductRepo } from '../domain/product-repo';

type CosmosProductDocument = {
  id: string;
  name: string;
  description: string;
  pricePence: number;
  updatedAt: string;
};

export type CosmosProductRepoOptions = {
  endpoint: string;
  databaseId: string;
  containerId: string;
  key: string;
};

export class CosmosProductRepo implements ProductRepo {
  private readonly container: Container;

  constructor(options: CosmosProductRepoOptions) {
    if (!options) {
      throw new Error('CosmosProductRepo requires options');
    }

    const { endpoint, databaseId, containerId, key } = options;

    if (typeof endpoint !== 'string' || endpoint.trim() === '') {
      throw new Error('CosmosProductRepo requires a non-empty endpoint option');
    }

    if (typeof databaseId !== 'string' || databaseId.trim() === '') {
      throw new Error(
        'CosmosProductRepo requires a non-empty databaseId option',
      );
    }

    if (typeof containerId !== 'string' || containerId.trim() === '') {
      throw new Error(
        'CosmosProductRepo requires a non-empty containerId option',
      );
    }

    if (typeof key !== 'string' || key.trim() === '') {
      throw new Error('CosmosProductRepo requires a non-empty key option');
    }

    const cosmosClient = new CosmosClient({ endpoint, key });

    this.container = cosmosClient.database(databaseId).container(containerId);
  }

  // This container uses /id: point operations need the id as the partition value.
  // Other partition designs must supply their actual partition value.
  async getById(id: string): Promise<Product | null> {
    const { resource } = await this.container
      .item(id, id)
      .read<CosmosProductDocument>();

    // The SDK returns an undefined resource when an item read returns 404.
    return resource ? this.fromDocument(resource) : null;
  }

  async list(): Promise<readonly Product[]> {
    // Fetch all results into memory for this small demo; larger datasets need pagination.
    const { resources } = await this.container.items
      .readAll<CosmosProductDocument>()
      .fetchAll();

    return resources.map((resource) => this.fromDocument(resource));
  }

  async save(product: Product): Promise<Product> {
    const document = this.toDocument(product);

    const { resource } =
      await this.container.items.upsert<CosmosProductDocument>(document);

    if (!resource) {
      throw new Error('No resource returned from Cosmos DB upsert');
    }

    return this.fromDocument(resource);
  }

  async delete(id: string): Promise<void> {
    try {
      await this.container.item(id, id).delete();
    } catch (error) {
      // Make not found a no-op to simplify client code; the product is already gone.
      if (error instanceof ErrorResponse && error.code === 404) {
        return;
      }

      // Let unexpected failures propagate to the caller's error boundary.
      throw error;
    }
  }

  private fromDocument(document: CosmosProductDocument): Product {
    // SDK type arguments do not validate stored data at runtime.
    if (typeof document.updatedAt !== 'string') {
      throw new Error('Stored product updatedAt must be a date string');
    }

    const result = createProduct({
      id: document.id,
      name: document.name,
      description: document.description,
      pricePence: document.pricePence,
      updatedAt: new Date(document.updatedAt),
    });

    if (!result.success) {
      // Invalid stored data is an infrastructure failure, not a client validation error.
      throw new Error(
        `Invalid product stored in Cosmos DB (${document.id}): ${JSON.stringify(result.issues)}`,
      );
    }

    return result.data;
  }

  private toDocument(product: Product): CosmosProductDocument {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      pricePence: product.pricePence,
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
