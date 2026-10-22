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

  const mockFetch = mock.fn(async (urlStr) => {
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

    // Watchmode Sources API
    if (url.hostname === "api.watchmode.com" && /^\/v1\/title\/movie-\d+\/sources\/$/.test(url.pathname)) {
      if (url.pathname === "/v1/title/movie-2/sources/") {
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
    const watchmodeCalls = mockFetch.mock.calls.filter((call) =>
      new URL(call.arguments[0]).hostname === "api.watchmode.com",
    );
    assert.deepEqual(watchmodeCalls.map((call) => new URL(call.arguments[0]).pathname).sort(), [
      "/v1/title/movie-2/sources/", "/v1/title/movie-3/sources/",
    ]);
    assert.ok(watchmodeCalls.every((call) => call.arguments[1].next.revalidate === 21600));


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

test("GET /api/releases handles getNowPlayingMovieIds error gracefully", async () => {
  const originalTmdbKey = process.env.TMDB_API_KEY;
  process.env.TMDB_API_KEY = "tmdb-test-key";

  const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const mockFetch = mock.fn(async (urlStr) => {
    const url = new URL(urlStr);

    if (url.hostname === "api.themoviedb.org" && url.pathname === "/3/discover/movie") {
      // Return a recent movie to verify that when now_playing throws, it defaults to an empty set
      // and the movie is categorized as "released".
      return new Response(JSON.stringify({
        results: [
          {
            id: 3,
            title: "Expected Now Playing Movie",
            release_date: pastDate,
            genre_ids: [27],
            overview: "",
            poster_path: null,
            backdrop_path: null
          }
        ]
      }), { status: 200 });
    }

    if (url.hostname === "api.themoviedb.org" && url.pathname === "/3/movie/now_playing") {
      throw new Error("Network error for now_playing");
    }

    return new Response("Not found", { status: 404 });
  });

  const originalFetch = globalThis.fetch;
  mock.method(globalThis, "fetch", mockFetch);
  const originalConsoleError = console.error;
  let consoleErrorCalledCount = 0;
  mock.method(console, "error", (...args) => {
    if (args[0] === "Could not refresh TMDb now-playing titles") {
      consoleErrorCalledCount++;
    }
  });

  try {
    const response = await GET();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.releases);

    // We mocked discover/movie to return a recent movie. Since now_playing failed,
    // it won't be in the nowPlayingMovieIds set. Therefore, it should be marked as "released".
    assert.equal(data.releases[0].stage, "released");
    assert.equal(consoleErrorCalledCount, 1);
  } finally {
    console.error = originalConsoleError;
    globalThis.fetch = originalFetch;
    if (originalTmdbKey !== undefined) process.env.TMDB_API_KEY = originalTmdbKey;
    else delete process.env.TMDB_API_KEY;
  }
});


test("release deduplication preserves first metadata and recent/upcoming order", async () => {
  const oldKey = process.env.TMDB_API_KEY;
  const oldWatchmodeKey = process.env.WATCHMODE_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.TMDB_API_KEY = "test-deduplication";
  delete process.env.WATCHMODE_API_KEY;
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const movie = (id, title, release_date) => ({ id, title, release_date, genre_ids: [27], overview: "", poster_path: null, backdrop_path: null });
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname === "/3/movie/now_playing") return Response.json({ results: [] });
    assert.equal(url.pathname, "/3/discover/movie");
    const upcoming = url.searchParams.get("primary_release_date.gte") > today;
    return Response.json({ results: upcoming
      ? [movie(1, "First upcoming", future), movie(2, "Conflicting upcoming", future)]
      : [movie(2, "First recent", today), movie(2, "Duplicate recent", today), movie(3, "Second recent", today)] });
  };
  try {
    const response = await GET();
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.deepEqual(data.releases.map(({ tmdbId, title }) => [tmdbId, title]), [
      [2, "First recent"], [3, "Second recent"], [1, "First upcoming"],
    ]);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = oldKey;
    if (oldWatchmodeKey === undefined) delete process.env.WATCHMODE_API_KEY;
    else process.env.WATCHMODE_API_KEY = oldWatchmodeKey;
  }
});
