import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/image/route.ts";

test("GET valid image request with explicit size", async () => {
  const originalFetch = globalThis.fetch;
  let fetchUrl;
  globalThis.fetch = async (url) => {
    fetchUrl = url;
    return new Response(Buffer.from("fake-image-data"), {
      status: 200,
      headers: { "content-type": "image/webp" },
    });
  };

  try {
    const req = new Request("http://localhost/api/image?size=w780&path=/test-image.webp");
    const res = await GET(req);
    assert.equal(res.status, 200);
    assert.equal(fetchUrl, "https://image.tmdb.org/t/p/w780/test-image.webp");
    assert.equal(res.headers.get("Content-Type"), "image/webp");
    assert.equal(res.headers.get("Cache-Control"), "public, s-maxage=604800, stale-while-revalidate=2592000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET valid image request with default size", async () => {
  const originalFetch = globalThis.fetch;
  let fetchUrl;
  globalThis.fetch = async (url) => {
    fetchUrl = url;
    return new Response(Buffer.from("fake-image-data"), {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
  };

  try {
    const req = new Request("http://localhost/api/image?path=/default-image.jpg");
    const res = await GET(req);
    assert.equal(res.status, 200);
    assert.equal(fetchUrl, "https://image.tmdb.org/t/p/w500/default-image.jpg");
    assert.equal(res.headers.get("Content-Type"), "image/jpeg");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET invalid size", async () => {
  const req = new Request("http://localhost/api/image?size=w999&path=/test-image.webp");
  const res = await GET(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "Invalid image request");
});

test("GET invalid path", async () => {
  const req = new Request("http://localhost/api/image?size=w500&path=invalid_path");
  const res = await GET(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "Invalid image request");
});

test("GET missing path", async () => {
  const req = new Request("http://localhost/api/image?size=w500");
  const res = await GET(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.equal(data.error, "Invalid image request");
});

test("GET fetch failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network error");
  };

  try {
    const req = new Request("http://localhost/api/image?size=w500&path=/test-image.webp");
    const res = await GET(req);
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.equal(data.error, "Image unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GET non-ok upstream response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response("Not Found", { status: 404 });
  };

  try {
    const req = new Request("http://localhost/api/image?size=w500&path=/test-image.webp");
    const res = await GET(req);
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.equal(data.error, "Image unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
