import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/trailer/[id]/route.ts";

// Utility to create a mock request
function createRequest(url) {
  return new Request(url);
}

// Utility to create context
function createContext(id) {
  return { params: Promise.resolve({ id }) };
}

test("GET redirects to YouTube search when TMDB_API_KEY is missing", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;

  try {
    const req = createRequest("http://localhost/api/trailer/123");
    const ctx = createContext("123");
    const res = await GET(req, ctx);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://www.youtube.com/results?search_query=horror%20movie%20trailer");
  } finally {
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  }
});

test("GET redirects to YouTube search when id is invalid", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "test-key";

  try {
    const req = createRequest("http://localhost/api/trailer/123abc");
    const ctx = createContext("123abc");
    const res = await GET(req, ctx);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://www.youtube.com/results?search_query=horror%20movie%20trailer");
  } finally {
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  }
});

test("GET redirects to YouTube search with query when q parameter is provided and id is invalid", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "test-key";

  try {
    const req = createRequest("http://localhost/api/trailer/invalid?q=The%20Matrix");
    const ctx = createContext("invalid");
    const res = await GET(req, ctx);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://www.youtube.com/results?search_query=The%20Matrix%20trailer");
  } finally {
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
  }
});

test("GET redirects to YouTube search when TMDb fetch throws an error", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.TMDB_API_KEY = "test-key";
  globalThis.fetch = async () => {
    throw new Error("Network Error");
  };

  try {
    const req = createRequest("http://localhost/api/trailer/123");
    const ctx = createContext("123");
    const res = await GET(req, ctx);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://www.youtube.com/results?search_query=horror%20movie%20trailer");
  } finally {
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test("GET redirects to YouTube search when TMDb fetch returns non-200", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.TMDB_API_KEY = "test-key";
  globalThis.fetch = async () => {
    return { ok: false };
  };

  try {
    const req = createRequest("http://localhost/api/trailer/123");
    const ctx = createContext("123");
    const res = await GET(req, ctx);

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://www.youtube.com/results?search_query=horror%20movie%20trailer");
  } finally {
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});

test("GET selects the best video match based on scoring logic", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  const originalFetch = globalThis.fetch;

  process.env.TMDB_API_KEY = "test-key";

  const testCases = [
    {
      name: "returns highest score (official trailer) when multiple videos present",
      videos: [
        { key: "teaser1", site: "YouTube", type: "Teaser", official: true },
        { key: "trailer_unofficial", site: "YouTube", type: "Trailer", official: false },
        { key: "trailer_official", site: "YouTube", type: "Trailer", official: true },
      ],
      expectedKey: "trailer_official"
    },
    {
      name: "returns score 2 (unofficial trailer) when no official trailer present",
      videos: [
        { key: "teaser1", site: "YouTube", type: "Teaser", official: true },
        { key: "trailer_unofficial", site: "YouTube", type: "Trailer", official: false },
      ],
      expectedKey: "trailer_unofficial"
    },
    {
      name: "returns score 1 (teaser) when no trailers present",
      videos: [
        { key: "featurette", site: "YouTube", type: "Featurette", official: true },
        { key: "teaser1", site: "YouTube", type: "Teaser", official: false }, // Teasers score 1 regardless of official status
      ],
      expectedKey: "teaser1"
    },
    {
      name: "ignores non-YouTube videos",
      videos: [
        { key: "vimeo_trailer", site: "Vimeo", type: "Trailer", official: true },
        { key: "youtube_teaser", site: "YouTube", type: "Teaser", official: true },
      ],
      expectedKey: "youtube_teaser"
    },
    {
      name: "falls back to search when no matching videos found",
      videos: [
        { key: "featurette", site: "YouTube", type: "Featurette", official: true },
        { key: "vimeo_trailer", site: "Vimeo", type: "Trailer", official: true },
      ],
      expectedFallback: true
    }
  ];

  try {
  for (const { name, videos, expectedKey, expectedFallback } of testCases) {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ results: videos })
    });

    try {
      const req = createRequest("http://localhost/api/trailer/123");
      const ctx = createContext("123");
      const res = await GET(req, ctx);

      assert.equal(res.status, 302, `Failed test case: ${name}`);

      if (expectedFallback) {
        assert.equal(res.headers.get("location"), "https://www.youtube.com/results?search_query=horror%20movie%20trailer", `Failed test case: ${name}`);
      } else {
        assert.equal(res.headers.get("location"), `https://www.youtube.com/watch?v=${expectedKey}`, `Failed test case: ${name}`);
      }
    } finally {
      // Clean up fetch mock for each iteration is handled by overriding it at start of loop
    }
  }

  } finally {
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
    globalThis.fetch = originalFetch;
  }
});
