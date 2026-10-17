import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { GET } from "../app/api/releases/route.ts";

test("GET /api/releases handles missing TMDB API key", async () => {
  const originalKey = process.env.TMDB_API_KEY;
  delete process.env.TMDB_API_KEY;

  const response = await GET();
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.error, "Movie source is not configured");

  if (originalKey !== undefined) {
    process.env.TMDB_API_KEY = originalKey;
  }
});

test("GET /api/releases fetches and transforms releases with mocked APIs", async () => {
  const originalTmdbKey = process.env.TMDB_API_KEY;
  const originalWmKey = process.env.WATCHMODE_API_KEY;

  process.env.TMDB_API_KEY = "tmdb-test-key";
  process.env.WATCHMODE_API_KEY = "wm-test-key";

  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const mockFetch = mock.fn(async (urlStr, init) => {
    const url = new URL(urlStr);

    // TMDb Discover Movie API
    if (url.hostname === "api.themoviedb.org" && url.pathname === "/3/discover/movie") {
      const isUpcoming = url.searchParams.get("primary_release_date.gte") > today;
      return new Response(JSON.stringify({
        results: isUpcoming ? [
          {
            id: 1,
            title: "Upcoming Movie",
            release_date: futureDate,
            genre_ids: [27],
            overview: "Upcoming overview",
            poster_path: "/upcoming-poster.jpg",
            backdrop_path: "/upcoming-backdrop.jpg"
          }
        ] : [
          {
            id: 2,
            title: "Recent Movie",
            release_date: pastDate,
            genre_ids: [53], // Thriller
            overview: "Recent overview with a longer synopsis to ensure it parses correctly but stays under the limit",
            poster_path: null,
            backdrop_path: null
          },
          {
            id: 3,
            title: "Now Playing Movie",
            release_date: pastDate,
            genre_ids: [27],
            overview: "",
            poster_path: null,
            backdrop_path: null
          }
        ]
      }), { status: 200 });
    }

    // TMDb Now Playing API
    if (url.hostname === "api.themoviedb.org" && url.pathname === "/3/movie/now_playing") {
      return new Response(JSON.stringify({
        results: [{ id: 3 }]
      }), { status: 200 });
    }

    // Watchmode Search API
    if (url.hostname === "api.watchmode.com" && url.pathname === "/v1/search/") {
      const tmdbId = url.searchParams.get("search_value");
      if (tmdbId === "2") {
        return new Response(JSON.stringify({
          title_results: [{ id: 102 }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ title_results: [] }), { status: 200 });
    }

    // Watchmode Sources API
    if (url.hostname === "api.watchmode.com" && url.pathname.includes("/sources/")) {
      if (url.pathname.includes("/102/")) {
        return new Response(JSON.stringify([
          { name: "Netflix", type: "sub", region: "US" },
          { name: "Netflix", type: "sub", region: "GB" } // Non-US should be filtered
        ]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  });

  const originalFetch = globalThis.fetch;
  mock.method(globalThis, "fetch", mockFetch);
  const originalConsoleError = console.error;
  mock.method(console, "error", () => {});

  try {
    const response = await GET();
    assert.equal(response.status, 200);
    const data = await response.json();

    assert.ok(data.releases);
    assert.equal(data.releases.length, 3);

    // Recent movie with streaming
    const recent = data.releases.find(r => r.title === "Recent Movie");
    assert.ok(recent);
    assert.equal(recent.stage, "streaming");
    assert.equal(recent.platform, "Netflix");
    assert.equal(recent.availability, "Streaming now");
    assert.equal(recent.genre, "Thriller");
    assert.equal(recent.tmdbId, 2);

    // Now playing movie
    const nowPlaying = data.releases.find(r => r.title === "Now Playing Movie");
    assert.ok(nowPlaying);
    assert.equal(nowPlaying.stage, "theaters");
    assert.equal(nowPlaying.availability, "In theaters");
    assert.equal(nowPlaying.note, "A synopsis has not been published yet.");

    // Upcoming movie
    const upcoming = data.releases.find(r => r.title === "Upcoming Movie");
    assert.ok(upcoming);
    assert.equal(upcoming.stage, "soon");
    assert.equal(upcoming.availability, "Theatrical date");
    assert.ok(upcoming.poster.includes("upcoming-poster.jpg"));

  } finally {
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    if (originalTmdbKey !== undefined) process.env.TMDB_API_KEY = originalTmdbKey;
    else delete process.env.TMDB_API_KEY;
    if (originalWmKey !== undefined) process.env.WATCHMODE_API_KEY = originalWmKey;
    else delete process.env.WATCHMODE_API_KEY;
  }
});

test("GET /api/releases handles API errors gracefully", async () => {
  const originalTmdbKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "tmdb-test-key";

  const mockFetch = mock.fn(async () => {
    return new Response("Server error", { status: 500 });
  });

  const originalFetch = globalThis.fetch;
  mock.method(globalThis, "fetch", mockFetch);
  const originalConsoleError = console.error;
  mock.method(console, "error", () => {});

  try {
    const response = await GET();
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.error, "Could not refresh the theatrical feed");
  } finally {
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    if (originalTmdbKey !== undefined) process.env.TMDB_API_KEY = originalTmdbKey;
    else delete process.env.TMDB_API_KEY;
  }
});
