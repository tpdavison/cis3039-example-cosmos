import { getCosmosTarget, getProductRepo } from '../src/config/composition-root';
import { createProduct } from '../src/domain/product';
import { testProducts } from './test-products';

async function main(): Promise<void> {
  const products = testProducts.map((params) => {
    const result = createProduct(params);

    if (!result.success) {
      throw new Error(
        `Invalid seed product ${params.id}: ${JSON.stringify(result.issues)}`,
      );
    }

    return result.data;
  });

  const repo = getProductRepo();
  console.log('Seed target:', JSON.stringify(getCosmosTarget(), null, 2));
  console.log('Reruns overwrite the three sample IDs and retain unrelated records.');
  console.log('Writes are sequential, not transactional; a failure can leave earlier writes saved.');

  for (const product of products) {
    await repo.save(product);
    console.log(`Seeded product ${product.id}`);
  }

  console.log('Completed seeding products.');
}

main().catch((error: unknown) => {
  console.error(
    'Failed to seed products:',
    error instanceof Error ? error.message : 'Unexpected seeding failure'
  );
  process.exitCode = 1;
});
