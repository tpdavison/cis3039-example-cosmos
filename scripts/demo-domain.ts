import { createProduct } from '../src/domain/product';

// Run with: npm run demo:domain
// After adding the 100-character limit, this example should report a name issue.
const result = createProduct({
  id: 'product-1',
  name: 'A'.repeat(101),
  pricePence: 1250,
  description: 'A sample product.',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
});

if (result.success) {
  const product = result.data;
  console.log(
    `Created Product with a ${product.name.length}-character name:`,
  );
  console.log(product);
} else {
  console.log('Product validation failed:');
  for (const issue of result.issues) {
    console.log(`${issue.field}: ${issue.message}`);
  }
}
