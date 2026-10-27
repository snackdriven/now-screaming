import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// Resolve Worker bindings and the Drizzle factory without loading a real Worker or D1 database.
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
  let source;
  if (specifier === 'cloudflare:workers') source = 'export const env = {};';
  if (specifier === 'drizzle-orm/d1') source = 'export function drizzle(binding, options) { return { binding, options }; }';
  if (source) return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
  return nextResolve(specifier, context);
}
`));
const { env } = await import("cloudflare:workers");
const { getDb } = await import("../db/index.ts");

test("getDb passes the D1 binding to drizzle", () => {
  const binding = { name: "mock-d1-binding" };
  env.DB = binding;
  try {
    const db = getDb();
    assert.equal(db.binding, binding);
  } finally {
    delete env.DB;
  }
});

test("getDb rejects an unavailable D1 binding", () => {
  delete env.DB;
  assert.throws(() => getDb(), /Cloudflare D1 binding `DB` is unavailable/);
});
