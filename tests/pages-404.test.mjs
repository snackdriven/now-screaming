import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("GitHub Pages artifact contains the branded 404 fallback", async () => {
  const html = await readFile(new URL("../dist-pages/404.html", import.meta.url), "utf8");

  assert.match(html, /<title>Lost in the Lobby · Now Screaming<\/title>/);
  assert.match(html, /<main\b[^>]*aria-labelledby="lost-title"/);
  assert.match(html, /<h1\b[^>]*id="lost-title"[^>]*>Lost in the Lobby<\/h1>/);
  assert.match(html, /href="\/"[^>]*>Return to the tracker/);
  assert.match(html, /cinema-lobby-oversized-smile\.webp/);
  assert.match(html, /prefers-reduced-motion/);
});
