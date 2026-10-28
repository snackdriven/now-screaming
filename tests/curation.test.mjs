import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCuration,
  buildPublishedCsvUrl,
  extractSpreadsheetId,
  normalizeDateInput,
  parseCurationText,
  serializeCurationCsv,
} from "../app/curation.ts";
import { buildExportRows, enrichCurationRows } from "../scripts/sheets-sync.mjs";

const baseFeed = [
  {
    title: "Other Mommy",
    date: "Oct 9",
    month: "OCT",
    year: "2026",
    genre: "Horror",
    stage: "streaming",
    availability: "Rent or buy",
    platform: "Fandango at Home",
    note: "Original synopsis.",
    color: "violet",
    tmdbId: 1400837,
    trailerUrl: "https://www.youtube.com/watch?v=-mnTITqqiT0",
  },
  {
    title: "Victorian Psycho",
    date: "Nov 13",
    month: "NOV",
    year: "2026",
    genre: "Horror",
    stage: "soon",
    availability: "Theatrical date",
    note: "Remote Gothic manor.",
    color: "blood",
    tmdbId: 1379486,
  },
];

test("parseCurationText handles flexible headers, CSV quotes, TSV, and platform separators", () => {
  const csv = [
    "Action,Title,Year,TMDb ID,Subgenres,Festival Buzz,Status Override,Platform,Notes,Curated By",
    'upsert,"The Ugly Stepsister",2026,123456,"Body horror","Sundance Midnight","In theaters","Shudder, AMC+","A twisted fairy tale, with teeth.",Kayla',
    "hide,Victorian Psycho,2026,1379486,,,,,,",
  ].join("\n");

  const rows = parseCurationText(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    action: "upsert",
    title: "The Ugly Stepsister",
    year: "2026",
    tmdbId: 123456,
    genre: "Body horror",
    festivalBuzz: "Sundance Midnight",
    stage: "theaters",
    platform: "Shudder · AMC+",
    note: "A twisted fairy tale, with teeth.",
    curatedBy: "Kayla",
  });
  assert.equal(rows[1].action, "hide");
  assert.equal(rows[1].tmdbId, 1379486);
});

test("applyCuration overrides existing movies, appends new festival picks, and hides excluded rows", () => {
  const csv = [
    "action,title,year,date,tmdb_id,stage,genre,festival_buzz,availability,platform,note",
    "upsert,Other Mommy,2026,,1400837,streaming,Supernatural horror,Fantastic Fest,Streaming now,Shudder | Philo,Updated curator note.",
    "hide,Victorian Psycho,2026,,1379486,,,,,,",
    "upsert,Midnight Catechism,2026,2026-10-30,,soon,Folk horror,TIFF Midnight Madness,Limited theatrical,,Nuns in the woods.",
  ].join("\n");

  const rows = parseCurationText(csv);
  const merged = applyCuration(baseFeed, rows);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].title, "Other Mommy");
  assert.equal(merged[0].genre, "Supernatural horror · Fantastic Fest");
  assert.equal(merged[0].availability, "Streaming now");
  assert.equal(merged[0].platform, "Shudder · Philo");
  assert.equal(merged[0].note, "Updated curator note.");

  assert.equal(merged[1].title, "Midnight Catechism");
  assert.equal(merged[1].date, "Oct 30");
  assert.equal(merged[1].month, "OCT");
  assert.equal(merged[1].year, "2026");
  assert.equal(merged[1].genre, "Folk horror · TIFF Midnight Madness");
  assert.equal(merged[1].stage, "soon");
  assert.equal(merged[1].availability, "Limited theatrical");
});

test("normalizeDateInput parses ISO, text dates, and slash dates consistently", () => {
  assert.deepEqual(normalizeDateInput("2026-10-17"), {
    date: "Oct 17",
    month: "OCT",
    year: "2026",
    isoDate: "2026-10-17",
  });
  assert.deepEqual(normalizeDateInput("Nov 3", "2026"), {
    date: "Nov 3",
    month: "NOV",
    year: "2026",
    isoDate: "2026-11-03",
  });
  assert.deepEqual(normalizeDateInput("12/25/2026"), {
    date: "Dec 25",
    month: "DEC",
    year: "2026",
    isoDate: "2026-12-25",
  });
});

test("extractSpreadsheetId and buildPublishedCsvUrl support full Google Sheets URLs and raw IDs", () => {
  const url = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=987654";
  assert.deepEqual(extractSpreadsheetId(url), {
    spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz",
    gid: "987654",
  });
  assert.equal(
    buildPublishedCsvUrl(url),
    "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/export?format=csv&gid=987654",
  );
});

test("enrichCurationRows resolves TMDb metadata, trailers, and Watchmode sources for minimal sheet rows", async () => {
  const mockFetch = async (input) => {
    const url = String(input);
    if (url.includes("/search/movie")) {
      return Response.json({
        results: [
          {
            id: 999001,
            title: "Cuckoo's Nest",
            release_date: "2026-08-14",
            overview: "A quiet cabin resort hides a brood of parasitic guests.",
            poster_path: "/poster999.jpg",
            backdrop_path: "/backdrop999.jpg",
            genre_ids: [27, 9648],
          },
        ],
      });
    }
    if (url.includes("/movie/999001/videos")) {
      return Response.json({
        results: [{ key: "abc123xyz", site: "YouTube", type: "Trailer", official: true }],
      });
    }
    if (url.includes("api.watchmode.com/v1/search")) {
      return Response.json({ title_results: [{ id: 55501 }] });
    }
    if (url.includes("api.watchmode.com/v1/title/55501/sources")) {
      return Response.json([
        { name: "Shudder", type: "sub", region: "US" },
        { name: "AMC+", type: "sub", region: "US" },
      ]);
    }
    return new Response("Not found", { status: 404 });
  };

  const minimalRows = parseCurationText(
    "title,year,festival_buzz\nCuckoo's Nest,2026,SXSW Midnighter\n",
  );
  const enriched = await enrichCurationRows(minimalRows, {
    tmdbApiKey: "fake-tmdb",
    watchmodeApiKey: "fake-watchmode",
    fetchImpl: mockFetch,
  });

  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].tmdbId, 999001);
  assert.equal(enriched[0].date, "Aug 14");
  assert.equal(enriched[0].year, "2026");
  assert.equal(enriched[0].stage, "streaming");
  assert.equal(enriched[0].availability, "Streaming now");
  assert.equal(enriched[0].platform, "Shudder · AMC+");
  assert.equal(enriched[0].poster, "https://image.tmdb.org/t/p/w342/poster999.jpg");
  assert.equal(enriched[0].trailerUrl, "https://www.youtube.com/watch?v=abc123xyz");

  const merged = applyCuration([], enriched);
  assert.equal(merged[0].genre, "Horror · SXSW Midnighter");
});

test("buildExportRows and serializeCurationCsv round-trip the catalog cleanly", async () => {
  const exportRows = await buildExportRows(baseFeed, [
    { action: "upsert", title: "Other Mommy", tmdbId: 1400837, festivalBuzz: "Overlook Film Fest", curatedBy: "Kayla" },
  ]);
  const csv = serializeCurationCsv(exportRows);
  const reparsed = parseCurationText(csv);

  assert.equal(reparsed.length, 2);
  assert.equal(reparsed[0].title, "Other Mommy");
  assert.equal(reparsed[0].festivalBuzz, "Overlook Film Fest");
  assert.equal(reparsed[0].curatedBy, "Kayla");
  assert.equal(reparsed[0].date, "2026-10-09");
});
