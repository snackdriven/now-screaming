// Google Sheets Live CMS / Zero-Backend Admin UI sync & export pipeline for Now Screaming.
// Supports pulling curation rows from:
// 1. Published CSV/TSV export URL or public Google Sheet ID (zero-auth)
// 2. Google Sheets API v4 (via GOOGLE_SHEETS_API_KEY)
// 3. Antigravity `gsheets` CLI or `gog` CLI (authenticated OAuth)
// 4. Local CSV/TSV file fallback (--csv path/to/file.csv)
// And enriches incomplete rows against TMDb + Watchmode before updating catalog files.

import { execFile } from "node:child_process";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  applyCuration,
  buildPublishedCsvUrl,
  extractSpreadsheetId,
  formatCurationMatrix,
  movieToCurationRow,
  normalizeDateInput,
  parseCurationMatrix,
  parseCurationText,
  serializeCurationCsv,
} from "../app/curation.ts";

const execFileAsync = promisify(execFile);

const genreNames = {
  27: "Horror",
  53: "Thriller",
  9648: "Mystery",
  878: "Sci-fi horror",
  14: "Fantasy horror",
};

function shortNote(overview) {
  const synopsis = (overview || "").trim();
  if (!synopsis) return "A synopsis has not been published yet.";
  if (synopsis.length <= 220) return synopsis;
  return `${synopsis.slice(0, 217).replace(/\s+\S*$/, "").trim()}…`;
}

export function parseArgs(argv) {
  const args = {
    mode: "sync", // "sync" | "export"
    sheet: process.env.CURATION_SHEET_ID || "",
    url: process.env.CURATION_SHEET_CSV_URL || "",
    gid: process.env.CURATION_SHEET_GID || "",
    tab: process.env.CURATION_SHEET_TAB || "",
    range: process.env.CURATION_SHEET_RANGE || "A1:P200",
    csvPath: "",
    outCsv: "",
    catalogPaths: ["site/public/data/releases.json", "app/fallback-releases.json"],
    curatedPath: "app/curated-releases.json",
    enrich: true,
    pushSheet: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--export" || arg === "export") {
      args.mode = "export";
    } else if (arg === "--sync" || arg === "sync") {
      args.mode = "sync";
    } else if (arg === "--sheet" && argv[i + 1]) {
      args.sheet = argv[++i];
    } else if (arg.startsWith("--sheet=")) {
      args.sheet = arg.slice("--sheet=".length);
    } else if (arg === "--url" && argv[i + 1]) {
      args.url = argv[++i];
    } else if (arg.startsWith("--url=")) {
      args.url = arg.slice("--url=".length);
    } else if (arg === "--gid" && argv[i + 1]) {
      args.gid = argv[++i];
    } else if (arg.startsWith("--gid=")) {
      args.gid = arg.slice("--gid=".length);
    } else if (arg === "--tab" && argv[i + 1]) {
      args.tab = argv[++i];
    } else if (arg.startsWith("--tab=")) {
      args.tab = arg.slice("--tab=".length);
    } else if (arg === "--range" && argv[i + 1]) {
      args.range = argv[++i];
    } else if (arg.startsWith("--range=")) {
      args.range = arg.slice("--range=".length);
    } else if ((arg === "--csv" || arg === "--file") && argv[i + 1]) {
      args.csvPath = argv[++i];
    } else if (arg.startsWith("--csv=")) {
      args.csvPath = arg.slice("--csv=".length);
    } else if (arg === "--out" && argv[i + 1]) {
      args.outCsv = argv[++i];
    } else if (arg.startsWith("--out=")) {
      args.outCsv = arg.slice("--out=".length);
    } else if (arg === "--curated-out" && argv[i + 1]) {
      args.curatedPath = argv[++i];
    } else if (arg === "--no-enrich") {
      args.enrich = false;
    } else if (arg === "--push-sheet") {
      args.pushSheet = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

async function fetchViaGsheetsCli(spreadsheetId, tab) {
  const tmpFile = join(tmpdir(), `ns-sheet-${process.pid}-${Date.now()}.csv`);
  const gsheetsBin = process.platform === "win32"
    ? join(process.env.USERPROFILE || "", ".gemini", "config", "plugins", "gsheets", "skills", "gsheets", "scripts", "gsheets.cmd")
    : "gsheets";

  const cliArgs = ["readonly", "export", spreadsheetId, tmpFile, "--format", "csv"];
  if (tab) cliArgs.push("--sheet", tab);

  try {
    await execFileAsync(gsheetsBin, cliArgs, { timeout: 15000, windowsHide: true });
    const content = await readFile(tmpFile, "utf8");
    await unlink(tmpFile).catch(() => {});
    return parseCurationText(content);
  } catch {
    await unlink(tmpFile).catch(() => {});
    throw new Error("gsheets CLI export unavailable or unauthenticated");
  }
}

async function fetchViaGogCli(spreadsheetId, tab, range) {
  const targetRange = tab ? `${tab}!${range}` : range;
  const { stdout } = await execFileAsync("gog", ["sheets", "get", spreadsheetId, targetRange, "--json"], {
    timeout: 15000,
    windowsHide: true,
    env: {
      ...process.env,
      GOG_KEYRING_PASSWORD: process.env.GOG_KEYRING_PASSWORD || "Testing123!!",
    },
  });
  const parsed = JSON.parse(stdout);
  const values = Array.isArray(parsed) ? parsed : parsed.values;
  if (!Array.isArray(values)) throw new Error("Unexpected gog sheets JSON structure");
  return parseCurationMatrix(values.map((row) => row.map((cell) => String(cell ?? ""))));
}

export async function loadCurationRows(options, fetchImpl = fetch) {
  if (options.csvPath) {
    const text = await readFile(resolve(options.csvPath), "utf8");
    return { rows: parseCurationText(text), source: `file:${options.csvPath}` };
  }

  if (options.url) {
    const csvUrl = buildPublishedCsvUrl(options.url, options.gid);
    const res = await fetchImpl(csvUrl);
    if (!res.ok) throw new Error(`Failed to fetch sheet CSV URL (${res.status})`);
    return { rows: parseCurationText(await res.text()), source: csvUrl };
  }

  if (options.sheet) {
    const { spreadsheetId, gid } = extractSpreadsheetId(options.sheet);
    const effectiveGid = options.gid || gid;
    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

    if (apiKey) {
      const targetRange = encodeURIComponent(options.tab ? `${options.tab}!${options.range}` : options.range);
      const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${targetRange}?key=${apiKey}`;
      const res = await fetchImpl(apiUrl);
      if (res.ok) {
        const data = await res.json();
        return { rows: parseCurationMatrix(data.values || []), source: `sheets-api:${spreadsheetId}` };
      }
    }

    // Try published/shared CSV export URL first (works zero-auth for shared/published sheets)
    const csvUrl = buildPublishedCsvUrl(spreadsheetId, effectiveGid);
    try {
      const res = await fetchImpl(csvUrl);
      const contentType = res.headers?.get?.("content-type") || "";
      if (res.ok && !contentType.includes("text/html")) {
        return { rows: parseCurationText(await res.text()), source: csvUrl };
      }
    } catch {
      // Fall through to authenticated CLI tools
    }

    // Fallback to Antigravity gsheets CLI, then gog CLI
    try {
      const rows = await fetchViaGsheetsCli(spreadsheetId, options.tab);
      return { rows, source: `gsheets:${spreadsheetId}` };
    } catch {
      const rows = await fetchViaGogCli(spreadsheetId, options.tab, options.range);
      return { rows, source: `gog:${spreadsheetId}` };
    }
  }

  throw new Error(
    "No curation source specified. Pass --csv <file>, --url <csv-export-url>, or --sheet <spreadsheet-id-or-url>.",
  );
}

async function fetchJson(url, fetchImpl) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

async function lookupWatchmode(tmdbId, watchmodeKey, fetchImpl) {
  if (!watchmodeKey || !tmdbId) return null;
  try {
    const searchUrl = `https://api.watchmode.com/v1/search/?${new URLSearchParams({
      apiKey: watchmodeKey,
      search_field: "tmdb_movie_id",
      search_value: String(tmdbId),
    })}`;
    const search = await fetchJson(searchUrl, fetchImpl);
    const match = search.title_results?.[0];
    if (!match) return null;
    const sources = await fetchJson(
      `https://api.watchmode.com/v1/title/${match.id}/sources/?apiKey=${watchmodeKey}`,
      fetchImpl,
    );
    const us = (sources || []).filter((s) => s.region === "US");
    const sub = us.filter((s) => s.type === "sub" || s.type === "free");
    const home = sub.length ? sub : us.filter((s) => s.type === "rent" || s.type === "buy");
    if (!home.length) return null;
    return {
      availability: sub.length ? "Streaming now" : "Rent or buy",
      platform: [...new Set(home.map((s) => s.name))].join(" · "),
    };
  } catch {
    return null;
  }
}

async function lookupTrailer(tmdbId, title, tmdbKey, fetchImpl) {
  const fallback = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} trailer`)}`;
  if (!tmdbKey || !tmdbId) return fallback;
  try {
    const data = await fetchJson(
      `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${tmdbKey}&language=en-US`,
      fetchImpl,
    );
    const videos = data.results || [];
    const trailer =
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official) ??
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer") ??
      videos.find((v) => v.site === "YouTube" && v.type === "Teaser");
    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : fallback;
  } catch {
    return fallback;
  }
}

export async function enrichCurationRows(
  rows,
  {
    tmdbApiKey = process.env.TMDB_API_KEY,
    watchmodeApiKey = process.env.WATCHMODE_API_KEY,
    fetchImpl = fetch,
  } = {},
) {
  if (!tmdbApiKey) return rows;

  const enriched = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    if (row.action === "hide") {
      enriched.push(row);
      continue;
    }

    const next = { ...row };
    let tmdbMovie = null;

    try {
      if (next.tmdbId) {
        tmdbMovie = await fetchJson(
          `https://api.themoviedb.org/3/movie/${next.tmdbId}?api_key=${tmdbApiKey}&language=en-US`,
          fetchImpl,
        );
      } else if (next.title) {
        const params = new URLSearchParams({
          api_key: tmdbApiKey,
          query: next.title,
          language: "en-US",
          include_adult: "false",
        });
        if (next.year) params.set("primary_release_year", String(next.year));
        const search = await fetchJson(`https://api.themoviedb.org/3/search/movie?${params}`, fetchImpl);
        tmdbMovie = search.results?.[0] || null;
      }
    } catch {
      tmdbMovie = null;
    }

    if (tmdbMovie) {
      next.tmdbId = next.tmdbId ?? tmdbMovie.id;
      next.title = next.title || tmdbMovie.title;

      if (!next.date && tmdbMovie.release_date) {
        const parsed = normalizeDateInput(tmdbMovie.release_date);
        if (parsed) {
          next.date = parsed.date;
          next.year = next.year ?? parsed.year;
        }
      } else if (!next.year && tmdbMovie.release_date) {
        next.year = tmdbMovie.release_date.slice(0, 4);
      }

      if (!next.genre) {
        const genreIds = tmdbMovie.genre_ids || (tmdbMovie.genres || []).map((g) => g.id);
        next.genre = genreIds.map((id) => genreNames[id]).find(Boolean) ?? "Horror";
      }

      if (!next.note && tmdbMovie.overview) {
        next.note = shortNote(tmdbMovie.overview);
      }

      if (!next.poster && tmdbMovie.poster_path) {
        next.poster = `https://image.tmdb.org/t/p/w342${tmdbMovie.poster_path}`;
      }

      if (!next.backdrop && tmdbMovie.backdrop_path) {
        next.backdrop = `https://image.tmdb.org/t/p/w1280${tmdbMovie.backdrop_path}`;
      }

      const releaseIso = tmdbMovie.release_date || "";
      const isPast = releaseIso && releaseIso <= today;
      if ((!next.platform || !next.availability) && isPast && watchmodeApiKey) {
        const home = await lookupWatchmode(next.tmdbId, watchmodeApiKey, fetchImpl);
        if (home) {
          next.stage = next.stage ?? "streaming";
          next.availability = next.availability ?? home.availability;
          next.platform = next.platform ?? home.platform;
        }
      }

      if (!next.stage && releaseIso) {
        next.stage = releaseIso <= today ? "released" : "soon";
      }

      if (!next.trailerUrl) {
        next.trailerUrl = await lookupTrailer(next.tmdbId, next.title, tmdbApiKey, fetchImpl);
      }
    }

    enriched.push(next);
  }

  return enriched;
}

async function readCatalogMovies(catalogPaths) {
  for (const p of catalogPaths) {
    try {
      const data = JSON.parse(await readFile(resolve(p), "utf8"));
      if (Array.isArray(data.releases)) return data.releases;
    } catch {
      // try next
    }
  }
  return [];
}

async function readExistingCurated(curatedPath) {
  try {
    const data = JSON.parse(await readFile(resolve(curatedPath), "utf8"));
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function buildExportRows(catalogMovies, existingCurated = []) {
  const byKey = new Map();
  for (const item of existingCurated) {
    const key = item.tmdbId ? `id:${item.tmdbId}` : `title:${(item.title || "").toLowerCase()}`;
    byKey.set(key, item);
  }

  const rows = catalogMovies.map((movie) => {
    const existing =
      (movie.tmdbId && byKey.get(`id:${movie.tmdbId}`)) ||
      byKey.get(`title:${movie.title.toLowerCase()}`);
    return movieToCurationRow(movie, existing);
  });

  // Include any hidden rows from existing curation so curators can still see/toggle them in the Sheet
  for (const item of existingCurated) {
    if (item.action === "hide") {
      rows.push(item);
    }
  }

  return rows;
}

async function pushCsvToGsheets(spreadsheetId, csvPath) {
  const gsheetsBin = process.platform === "win32"
    ? join(process.env.USERPROFILE || "", ".gemini", "config", "plugins", "gsheets", "skills", "gsheets", "scripts", "gsheets.cmd")
    : "gsheets";
  await execFileAsync(gsheetsBin, ["mutate", "import-csv", spreadsheetId, resolve(csvPath)], {
    timeout: 20000,
    windowsHide: true,
  });
}

export async function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.mode === "export") {
    const movies = await readCatalogMovies(args.catalogPaths);
    const existing = await readExistingCurated(args.curatedPath);
    const rows = await buildExportRows(movies, existing);
    const csv = serializeCurationCsv(rows);

    if (args.outCsv) {
      const outPath = resolve(args.outCsv);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, csv, "utf8");
      console.log(`Exported ${rows.length} releases to ${args.outCsv}`);
      if (args.pushSheet && args.sheet) {
        const { spreadsheetId } = extractSpreadsheetId(args.sheet);
        await pushCsvToGsheets(spreadsheetId, outPath);
        console.log(`Imported ${args.outCsv} into Google Sheet ${spreadsheetId}`);
      }
    } else {
      process.stdout.write(csv);
    }
    return { mode: "export", count: rows.length };
  }

  const { rows: rawRows, source } = await loadCurationRows(args);
  const rows = args.enrich ? await enrichCurationRows(rawRows) : rawRows;
  const nowIso = new Date().toISOString();

  if (!args.dryRun) {
    const curatedOut = resolve(args.curatedPath);
    await mkdir(dirname(curatedOut), { recursive: true });
    await writeFile(
      curatedOut,
      `${JSON.stringify({ updatedAt: nowIso, source, items: rows }, null, 2)}\n`,
      "utf8",
    );

    for (const catalogPath of args.catalogPaths) {
      try {
        const fullPath = resolve(catalogPath);
        const existingData = JSON.parse(await readFile(fullPath, "utf8"));
        if (Array.isArray(existingData.releases)) {
          const merged = applyCuration(existingData.releases, rows);
          await writeFile(
            fullPath,
            `${JSON.stringify({ releases: merged, updatedAt: nowIso }, null, 2)}\n`,
            "utf8",
          );
          console.log(`Synced ${rows.length} curated rows into ${catalogPath} (${merged.length} total releases)`);
        }
      } catch {
        // Ignore missing optional target
      }
    }
  } else {
    console.log(`[dry-run] Parsed ${rows.length} curated rows from ${source}`);
  }

  return { mode: "sync", count: rows.length, rows, source, matrix: formatCurationMatrix(rows) };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
