import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/releases/route.ts";

test("GET falls back to released when TMDb now-playing refresh fails", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TMDB_API_KEY;
  const originalWatchmodeKey = process.env.WATCHMODE_API_KEY;
  const originalConsoleError = console.error;
  const errors = [];
  let nowPlayingCalls = 0;

  process.env.TMDB_API_KEY = "test-key";
  delete process.env.WATCHMODE_API_KEY;
  console.error = (...args) => errors.push(args);
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/3/movie/now_playing") {
      nowPlayingCalls++;
      throw new Error("TMDb now-playing unavailable");
    }
    if (url.pathname === "/3/discover/movie") {
      const recent = url.searchParams.get("primary_release_date.lte") ===
        new Date().toISOString().slice(0, 10);
      return Response.json({
        results: recent ? [{
          id: 42,
          title: "Recent movie",
          overview: "Recent release",
          release_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
          poster_path: null,
          backdrop_path: null,
          genre_ids: [27],
        }] : [],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const response = await GET({ headers: new Headers({ "oai-authenticated-user-email": "test@example.com", "x-chatgpt-proxy-secret": process.env.CHATGPT_PROXY_SECRET || "" }) });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(nowPlayingCalls, 3);
    assert.deepEqual(body.releases.map(({ title, stage }) => ({ title, stage })), [
      { title: "Recent movie", stage: "released" },
    ]);
    assert.ok(errors.some(([message]) => message === "Could not refresh TMDb now-playing titles"));
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = originalKey;
    if (originalWatchmodeKey === undefined) delete process.env.WATCHMODE_API_KEY;
    else process.env.WATCHMODE_API_KEY = originalWatchmodeKey;
  }
});
