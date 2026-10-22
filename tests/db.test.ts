import { register } from "node:module";
register("data:text/javascript,export async function resolve(specifier, context, nextResolve) { if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = { DB: {} };', format: 'module', shortCircuit: true }; return nextResolve(specifier, context); }");

import { test, mock } from "node:test";
import assert from "node:assert";

mock.module("drizzle-orm/d1", {
  namedExports: {
    drizzle: (db, opts) => ({ instance: "mock_db_instance", db, opts }),
  },
});

test("returns a drizzle instance when env.DB is defined", async () => {
  const { env } = await import("cloudflare:workers");
  env.DB = "mock_binding";

  const { getDb } = await import("../db/index.ts?1");
  const db = getDb();
  assert.equal(db.instance, "mock_db_instance");
  assert.equal(db.db, "mock_binding");
});

test("throws an error when env.DB is not defined", async () => {
  const { env } = await import("cloudflare:workers");
  env.DB = undefined;

  const { getDb } = await import("../db/index.ts?2");
  assert.throws(
    () => getDb(),
    /Cloudflare D1 binding `DB` is unavailable/
  );
});
