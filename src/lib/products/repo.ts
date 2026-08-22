import type { Client } from "@libsql/client";
import { createRetryingClient, dbConfig } from "../libsql";

let clientInstance: Client | null = null;

function db() {
  if (!clientInstance) {
    clientInstance = createRetryingClient(dbConfig());
  }
  return clientInstance;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  keyBenefit: string;
  ctaText: string;
  active: boolean;
  createdAt: number;
}

const PRODUCTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  key_benefit TEXT NOT NULL,
  cta_text TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
)`;

const SEED_PRODUCT = {
  id: "prod_3d_portfolio",
  name: "3D Portfolio Template",
  price: 149000,
  keyBenefit: "Template portfolio 3D interaktif untuk developer",
  ctaText: "Beli sekarang",
};

let schemaEnsured = false;

async function ensureSchema() {
  if (schemaEnsured) return;
  await db().execute(PRODUCTS_SCHEMA);

  // Seed the default product if table is empty
  const count = await db().execute("SELECT COUNT(*) as cnt FROM products");
  if ((count.rows[0]?.cnt as number) === 0) {
    const now = Date.now();
    await db().execute({
      sql: `INSERT INTO products (id, name, price, key_benefit, cta_text, active, created_at)
            VALUES (?, ?, ?, ?, ?, 1, ?)`,
      args: [
        SEED_PRODUCT.id,
        SEED_PRODUCT.name,
        SEED_PRODUCT.price,
        SEED_PRODUCT.keyBenefit,
        SEED_PRODUCT.ctaText,
        now,
      ],
    });
    console.log(`[products] seeded default product: ${SEED_PRODUCT.name}`);
  }

  schemaEnsured = true;
}

function rowToProduct(row: any): Product {
  return {
    id: row.id as string,
    name: row.name as string,
    price: row.price as number,
    keyBenefit: row.key_benefit as string,
    ctaText: row.cta_text as string,
    active: Boolean(row.active),
    createdAt: row.created_at as number,
  };
}

export async function getActiveProducts(): Promise<Product[]> {
  await ensureSchema();
  const res = await db().execute("SELECT * FROM products WHERE active = 1");
  return res.rows.map(rowToProduct);
}

export async function createProduct(data: {
  name: string;
  price: number;
  keyBenefit: string;
  ctaText: string;
  active?: boolean;
}): Promise<Product> {
  await ensureSchema();
  const now = Date.now();
  const id = `prod_${now}_${Math.random().toString(36).substring(2, 9)}`;

  await db().execute({
    sql: `INSERT INTO products (id, name, price, key_benefit, cta_text, active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      data.name,
      data.price,
      data.keyBenefit,
      data.ctaText,
      data.active !== false ? 1 : 0,
      now,
    ],
  });

  const res = await db().execute({
    sql: "SELECT * FROM products WHERE id = ?",
    args: [id],
  });

  if (!res.rows[0]) throw new Error("Failed to create product");
  return rowToProduct(res.rows[0]);
}


export async function getProduct(id: string): Promise<Product | null> {
  await ensureSchema();
  const res = await db().execute({
    sql: "SELECT * FROM products WHERE id = ?",
    args: [id],
  });
  return res.rows[0] ? rowToProduct(res.rows[0]) : null;
}

