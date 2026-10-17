import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/releases/route.ts";

test("getNowPlayingMovieIds returns empty set on fetch error", async () => {
    const originalFetch = global.fetch;
    let fetchedNowPlaying = false;
    global.fetch = async (url, options) => {
        const urlStr = url.toString();
        if (urlStr.includes("now_playing")) {
            fetchedNowPlaying = true;
            throw new Error("Network error for now_playing");
        }
        // mock discover/movie
        if (urlStr.includes("discover/movie")) {
            return new Response(JSON.stringify({ results: [] }), { status: 200 });
        }
        return originalFetch(url, options);
    };
    const originalEnv = process.env;
    process.env = { ...originalEnv, TMDB_API_KEY: "dummy", WATCHMODE_API_KEY: "dummy" };
    try {
        const response = await GET();
        const data = await response.json();
        assert.equal(response.status, 200);
        assert.equal(fetchedNowPlaying, true);
        assert.deepEqual(data.releases, []);
    } finally {
        global.fetch = originalFetch;
        process.env = originalEnv;
    }
});
