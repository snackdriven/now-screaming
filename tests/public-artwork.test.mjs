import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("literal shared artwork references exist in both public directories", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const filenames = [...new Set([...page.matchAll(/\$\{art\}([^`$]+\.webp)/g)].map((match) => match[1]))];
  assert.ok(filenames.length > 0, "find the lobby artwork references");
  for (const filename of filenames) {
    const worker = await readFile(new URL(`../public/design/${filename}`, import.meta.url));
    const pages = await readFile(new URL(`../site/public/design/${filename}`, import.meta.url));
    assert.deepEqual(pages, worker, `${filename} must be identical in Worker and Pages builds`);
  }
});
