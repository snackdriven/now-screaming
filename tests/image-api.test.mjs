import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/image/route.ts";

test("GET returns 400 for invalid size", async () => {
  const request = new Request("http://localhost/api/image?size=w100&path=/image.jpg");
  const response = await GET(request);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.deepEqual(body, { error: "Invalid image request" });
});

test("GET returns 400 for invalid path extension", async () => {
  const request = new Request("http://localhost/api/image?size=w500&path=/image.txt");
  const response = await GET(request);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.deepEqual(body, { error: "Invalid image request" });
});

test("GET returns 400 for path missing leading slash", async () => {
  const request = new Request("http://localhost/api/image?size=w500&path=image.jpg");
  const response = await GET(request);
  assert.equal(response.status, 400);
});

test("GET returns 400 for completely empty path", async () => {
  const request = new Request("http://localhost/api/image?size=w500");
  const response = await GET(request);
  assert.equal(response.status, 400);
});
