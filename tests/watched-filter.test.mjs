import { test } from "node:test";
import assert from "node:assert/strict";
import { releasePool, stageCounts, applyStage } from "../app/releases.ts";

const movie = (title, stage) => ({
  title, stage,
  date: "Oct 17", month: "OCT", year: "2026",
  genre: "Slasher", availability: stage, note: "", color: "blood",
});

const catalogue = [
  movie("Camp Miasma", "soon"),      // the hero
  movie("The Last House", "soon"),
  movie("Soulm8te", "released"),
  movie("The Bay", "streaming"),
];
const FEATURE = "Camp Miasma";

const view = (overrides) => ({
  movies: catalogue, query: "", showWatched: false, watched: [], featureTitle: FEATURE, ...overrides,
});

const titles = (list) => list.map((item) => item.title);

// The hero is rendered above the list, so the list below it drops the duplicate.
test("the hero is hidden from the ordinary list", () => {
  assert.equal(titles(releasePool(view({}))).includes(FEATURE), false);
});

// The browser regression also verifies the featured title retains its watched control.
test("watched list omits the controllable hero and retains other watched titles", () => {
  const pool = releasePool(view({ showWatched: true, watched: [FEATURE, 'The Bay'] }));
  assert.deepEqual(titles(pool), ['The Bay']);
});

// Was the bug: counts were computed over the whole catalogue while the list also applied the
// watched and stage filters, so a tab could promise rows the list would never render. "Coming
// soon" is the case that bit — The Last House is soon but unwatched, so the old count said 1
// while the watched list rendered nothing.
test("stage counts are scoped to the watched view, not the whole catalogue", () => {
  const pool = releasePool(view({ showWatched: true, watched: ["Soulm8te", "The Bay"] }));
  const counts = stageCounts(pool);
  assert.deepEqual(
    { all: counts.all, soon: counts.soon, released: counts.released, streaming: counts.streaming, theaters: counts.theaters },
    { all: 2, soon: 0, released: 1, streaming: 1, theaters: 0 },
  );
});

test("every stage tab count equals the rows that tab renders", () => {
  const pool = releasePool(view({ showWatched: true, watched: ["Soulm8te", "The Bay"] }));
  const counts = stageCounts(pool);
  for (const stage of ["all", "theaters", "streaming", "released", "soon"]) {
    assert.equal(counts[stage], applyStage(pool, stage).length, `count mismatch on "${stage}"`);
  }
});

test("counts follow the search box too", () => {
  const pool = releasePool(view({ query: "soulm8te" }));
  assert.equal(stageCounts(pool).all, applyStage(pool, "all").length);
  assert.equal(stageCounts(pool).all, 1);
});
