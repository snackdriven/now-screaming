import assert from "node:assert/strict";
import test from "node:test";
import { cinemaPool, providers, selectFeature } from "../app/cinema.ts";
const movie = (title, stage, extra = {}) => ({
  title,
  stage,
  date: "Oct 17",
  month: "OCT",
  year: "2026",
  genre: "Horror",
  note: "",
  availability: stage,
  color: "blood",
  ...extra,
});
const films = [
  movie("Upcoming", "soon", { poster: "poster", backdrop: "backdrop" }),
  movie("Recent", "released"),
  movie("At home", "streaming", {
    platform: "Amazon Prime Video · Shudder · Amazon Prime Video",
    availability: "Subscription streaming",
  }),
  movie("Rental", "streaming", { availability: "Rent or buy" }),
];
test("all theatrical retains recently released titles and excludes home providers", () => {
  assert.deepEqual(
    cinemaPool(films, "theaters", "all", "", []).map((m) => m.title),
    ["Upcoming", "Recent"],
  );
});
test("home filters distinguish subscription from rental and search full provider names", () => {
  assert.deepEqual(
    cinemaPool(films, "home", "subscription", "amazon prime", []).map(
      (m) => m.title,
    ),
    ["At home"],
  );
  assert.deepEqual(
    cinemaPool(films, "home", "rent", "", []).map((m) => m.title),
    ["Rental"],
  );
  assert.deepEqual(providers(films[2]), ["Amazon Prime Video", "Shudder"]);
});
test("watched includes a featured title and allows it to be unmarked regardless of stage", () => {
  assert.deepEqual(
    cinemaPool(films, "watched", "soon", "", ["At home", "Upcoming"]).map(
      (m) => m.title,
    ),
    ["Upcoming", "At home"],
  );
  assert.equal(cinemaPool(films, "watched", "all", "", []).length, 0);
});
test("feature selection handles empty feeds and honors the chosen movie", () => {
  assert.equal(selectFeature([], "theaters", "soon"), undefined);
  assert.equal(selectFeature(films, "theaters", "soon")?.title, "Upcoming");
  assert.equal(selectFeature(films, "home", "all", "Rental")?.title, "Rental");
});
