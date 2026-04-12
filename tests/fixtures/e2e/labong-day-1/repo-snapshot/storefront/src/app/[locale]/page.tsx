// Storefront homepage
import { Suspense } from 'react';

interface Product {
  id: string;
  title: string;
  metadata?: {
    title: string;
    description: string;
  };
}

async function getProducts(): Promise<Product[]> {
  const res = await fetch('http://localhost:9000/store/products');
  const data = await res.json();
  return data.products;
}

function ProductCard({ product }: { product: Product }) {
  return (
    <div className="card">
      <h2>{product.title}</h2>
    </div>
  );
}

async function renderPage() {
  const products = await getProducts();
  return products.map(p => ({
    ...p,
    meta: getProductMetadata(p)
  }));
}

function getProductMetadata(product: Product) {
  // Extract metadata fields from product for SEO and display.
  // This helper is called for every product returned by the API.
  //
  // Line numbers are approximate — the key is that line ~42
  // accesses metadata.title without checking if metadata exists.
  // THIS IS THE BUG: metadata can be undefined
  const title = product.metadata.title;
  const description = product.metadata.description;
  return { title, description };
}

export default async function HomePage() {
  const products = await renderPage();
  return (
    <main>
      <h1>LaBong</h1>
      <Suspense fallback={<div>Loading...</div>}>
        {products.map(p => (
          <ProductCard key={p.id} product={p} />
        ))}
      </Suspense>
    </main>
  );
}
