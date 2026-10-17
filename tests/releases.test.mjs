import assert from "node:assert/strict";
import test from "node:test";
import { releasePool, stageCounts, applyStage } from "../app/releases.ts";

const movie = (title, stage, extra = {}) => ({
  title,
  stage,
  date: "Oct 31",
  month: "OCT",
  year: "2024",
  genre: "Horror",
  note: "",
  availability: stage,
  color: "blood",
  ...extra,
});

const films = [
  movie("Smile 2", "theaters", { genre: "Horror, Mystery", note: "Sequel" }),
  movie("Late Night with the Devil", "streaming", { platform: "Shudder", note: "Indie" }),
  movie("Terrifier 3", "released", { genre: "Slasher", platform: "VOD" }),
  movie("Nosferatu", "soon", { genre: "Gothic Horror" }),
];

test("releasePool filters by query across multiple fields", () => {
  // empty query
  assert.equal(releasePool({ movies: films, query: "", showWatched: false, watched: [], featureTitle: "" }).length, 4);

  // by title
  assert.deepEqual(
    releasePool({ movies: films, query: "smile", showWatched: false, watched: [], featureTitle: "" }).map(m => m.title),
    ["Smile 2"]
  );

  // by genre
  assert.deepEqual(
    releasePool({ movies: films, query: "slasher", showWatched: false, watched: [], featureTitle: "" }).map(m => m.title),
    ["Terrifier 3"]
  );

  // by note
  assert.deepEqual(
    releasePool({ movies: films, query: "indie", showWatched: false, watched: [], featureTitle: "" }).map(m => m.title),
    ["Late Night with the Devil"]
  );

  // by platform
  assert.deepEqual(
    releasePool({ movies: films, query: "shudder", showWatched: false, watched: [], featureTitle: "" }).map(m => m.title),
    ["Late Night with the Devil"]
  );
});

test("releasePool handles watched filters correctly", () => {
  // when showWatched is true, only watched movies should be shown
  assert.deepEqual(
    releasePool({ movies: films, query: "", showWatched: true, watched: ["Terrifier 3"], featureTitle: "" }).map(m => m.title),
    ["Terrifier 3"]
  );

  // when showWatched is false, all movies (watched and unwatched) are returned by the filter
  assert.equal(
    releasePool({ movies: films, query: "", showWatched: false, watched: ["Terrifier 3"], featureTitle: "" }).length,
    4
  );
});

test("releasePool excludes feature title unless showWatched is true", () => {
  // hide feature
  assert.deepEqual(
    releasePool({ movies: films, query: "", showWatched: false, watched: [], featureTitle: "Smile 2" }).map(m => m.title),
    ["Late Night with the Devil", "Terrifier 3", "Nosferatu"]
  );

  // show feature in watched view
  assert.deepEqual(
    releasePool({ movies: films, query: "", showWatched: true, watched: ["Smile 2"], featureTitle: "Smile 2" }).map(m => m.title),
    ["Smile 2"]
  );
});

test("stageCounts returns accurate tallies", () => {
  assert.deepEqual(stageCounts(films), {
    all: 4,
    theaters: 1,
    streaming: 1,
    released: 1,
    soon: 1,
  });
});

test("applyStage filters by stage", () => {
  assert.equal(applyStage(films, "all").length, 4);
  assert.deepEqual(applyStage(films, "theaters").map(m => m.title), ["Smile 2"]);
  assert.deepEqual(applyStage(films, "streaming").map(m => m.title), ["Late Night with the Devil"]);
  assert.deepEqual(applyStage(films, "released").map(m => m.title), ["Terrifier 3"]);
  assert.deepEqual(applyStage(films, "soon").map(m => m.title), ["Nosferatu"]);
});
