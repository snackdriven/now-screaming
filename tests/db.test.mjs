import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// Resolve Worker bindings and the Drizzle factory without loading a real Worker or D1 database.
// Resolve the extensionless schema import in the test loader, preserving production imports.
register("data:text/javascript," + encodeURIComponent("\nexport async function resolve(specifier, context, nextResolve) {\n  let source;\n  if (specifier === 'cloudflare:workers') source = 'export const env = {};';\n  if (specifier === 'drizzle-orm/d1') source = 'export function drizzle(binding, options) { return { binding, options }; }';\n  if (source) return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };\n  if (specifier === './schema' && context.parentURL?.endsWith('/db/index.ts')) {\n    return nextResolve('./schema.ts', context);\n  }\n  return nextResolve(specifier, context);\n}\n"));
const { env } = await import("cloudflare:workers");
const { getDb } = await import("../db/index.ts");
const schema = await import("../db/schema.ts");

test("getDb passes the D1 binding and schema to drizzle", () => {
  const binding = { name: "mock-d1-binding" };
  env.DB = binding;
  try {
    const db = getDb();
    assert.equal(db.binding, binding);
    assert.equal(db.options.schema, schema);
  } finally {
    delete env.DB;
  }
});

test("getDb rejects an unavailable D1 binding", () => {
  delete env.DB;
  assert.throws(() => getDb(), /Cloudflare D1 binding `DB` is unavailable/);
});
