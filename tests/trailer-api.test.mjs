import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/trailer/[id]/route.ts";

test("Trailer API redirects to YouTube search when TMDB_API_KEY is missing", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  try {
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const request = new Request("http://localhost/api/trailer/123");
    const response = await GET(request, { params: Promise.resolve({ id: "123" }) });

    assert.equal(fetchCalled, false, "fetch should not be called when TMDB_API_KEY is missing");
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "https://www.youtube.com/results?search_query=horror%20movie%20trailer"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  }
});

test("Trailer API redirects to YouTube search when ID is invalid", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  try {
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const request = new Request("http://localhost/api/trailer/invalid");
    const response = await GET(request, { params: Promise.resolve({ id: "invalid" }) });

    assert.equal(fetchCalled, false, "fetch should not be called when ID is invalid");
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "https://www.youtube.com/results?search_query=horror%20movie%20trailer"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  }
});

test("Trailer API uses 'q' search param for fallback search", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;

  try {
    globalThis.fetch = async () => {
      fetchCalled = true;
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    };

    const request = new Request("http://localhost/api/trailer/invalid?q=Smile%202");
    const response = await GET(request, { params: Promise.resolve({ id: "invalid" }) });

    assert.equal(fetchCalled, false, "fetch should not be called when ID is invalid");
    assert.equal(response.status, 302);
    assert.equal(
      response.headers.get("location"),
      "https://www.youtube.com/results?search_query=Smile%202%20trailer"
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  }
});
