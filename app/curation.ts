import type { Movie } from "./releases.ts";

export type CurationAction = "upsert" | "hide";

export type CurationRow = {
  action: CurationAction;
  title: string;
  year?: string;
  date?: string;
  tmdbId?: number;
  stage?: Movie["stage"];
  genre?: string;
  festivalBuzz?: string;
  availability?: string;
  platform?: string;
  note?: string;
  trailerUrl?: string;
  poster?: string;
  backdrop?: string;
  color?: string;
  curatedBy?: string;
};

export type CurationPayload = {
  updatedAt?: string;
  source?: string;
  items: CurationRow[];
};

export const SHEET_COLUMNS = [
  "action",
  "title",
  "year",
  "date",
  "tmdb_id",
  "stage",
  "genre",
  "festival_buzz",
  "availability",
  "platform",
  "note",
  "trailer_url",
  "poster",
  "backdrop",
  "color",
  "curated_by",
] as const;

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

const COLORS = ["violet", "blood", "acid", "ember", "sand"] as const;
const VALID_STAGES = new Set<Movie["stage"]>(["theaters", "streaming", "released", "soon"]);

const HEADER_ALIASES: Record<string, keyof CurationRow> = {
  action: "action",
  mode: "action",
  status: "action",
  title: "title",
  movie: "title",
  film: "title",
  year: "year",
  releaseyear: "year",
  date: "date",
  releasedate: "date",
  theatricaldate: "date",
  tmdbid: "tmdbId",
  tmdb: "tmdbId",
  id: "tmdbId",
  stage: "stage",
  statusoverride: "stage",
  stageoverride: "stage",
  genre: "genre",
  subgenre: "genre",
  subgenres: "genre",
  festivalbuzz: "festivalBuzz",
  festival: "festivalBuzz",
  buzz: "festivalBuzz",
  availability: "availability",
  availabilityoverride: "availability",
  platform: "platform",
  platforms: "platform",
  provider: "platform",
  providers: "platform",
  streamingplatform: "platform",
  note: "note",
  notes: "note",
  synopsis: "note",
  trailer: "trailerUrl",
  trailerurl: "trailerUrl",
  poster: "poster",
  posterurl: "poster",
  backdrop: "backdrop",
  backdropurl: "backdrop",
  color: "color",
  curatedby: "curatedBy",
  curator: "curatedBy",
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeDateInput(
  rawDate?: string,
  fallbackYear?: string,
): { date: string; month: string; year: string; isoDate?: string } | null {
  const value = (rawDate ?? "").trim();
  const cleanYear = (fallbackYear ?? "").trim();

  if (!value) {
    if (/^\d{4}$/.test(cleanYear)) {
      return { date: "Oct 31", month: "OCT", year: cleanYear, isoDate: `${cleanYear}-10-31` };
    }
    return null;
  }

  // ISO format YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const monthIndex = Number(m) - 1;
    const dayNum = Number(d);
    if (monthIndex >= 0 && monthIndex < 12 && dayNum >= 1 && dayNum <= 31) {
      const dateObj = new Date(Date.UTC(Number(y), monthIndex, dayNum, 12, 0, 0));
      const formatted = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(dateObj);
      const [shortMonth] = formatted.split(" ");
      return {
        date: formatted,
        month: shortMonth.toUpperCase(),
        year: y,
        isoDate: value,
      };
    }
  }

  // Short month format like "Oct 17" or "October 17" or "Oct 17, 2026"
  const textMatch = /^([A-Za-z]{3,9})\s+(\d{1,2})(?:,?\s*(\d{4}))?$/.exec(value);
  if (textMatch) {
    const [, rawMonth, rawDay, inlineYear] = textMatch;
    const monthPrefix = rawMonth.slice(0, 3).toUpperCase();
    const monthIndex = MONTHS.indexOf(monthPrefix as (typeof MONTHS)[number]);
    const dayNum = Number(rawDay);
    if (monthIndex !== -1 && dayNum >= 1 && dayNum <= 31) {
      const resolvedYear = inlineYear || (/^\d{4}$/.test(cleanYear) ? cleanYear : String(new Date().getUTCFullYear()));
      const formattedMonth = monthPrefix.charAt(0) + monthPrefix.slice(1).toLowerCase();
      const mm = String(monthIndex + 1).padStart(2, "0");
      const dd = String(dayNum).padStart(2, "0");
      return {
        date: `${formattedMonth} ${dayNum}`,
        month: monthPrefix,
        year: resolvedYear,
        isoDate: `${resolvedYear}-${mm}-${dd}`,
      };
    }
  }

  // Slash format M/D/YYYY or M/D
  const slashMatch = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(value);
  if (slashMatch) {
    const [, rawM, rawD, rawY] = slashMatch;
    const monthIndex = Number(rawM) - 1;
    const dayNum = Number(rawD);
    if (monthIndex >= 0 && monthIndex < 12 && dayNum >= 1 && dayNum <= 31) {
      const resolvedYear = rawY
        ? (rawY.length === 2 ? `20${rawY}` : rawY)
        : (/^\d{4}$/.test(cleanYear) ? cleanYear : String(new Date().getUTCFullYear()));
      const monthPrefix = MONTHS[monthIndex];
      const formattedMonth = monthPrefix.charAt(0) + monthPrefix.slice(1).toLowerCase();
      const mm = String(monthIndex + 1).padStart(2, "0");
      const dd = String(dayNum).padStart(2, "0");
      return {
        date: `${formattedMonth} ${dayNum}`,
        month: monthPrefix,
        year: resolvedYear,
        isoDate: `${resolvedYear}-${mm}-${dd}`,
      };
    }
  }

  return null;
}

export function normalizeStageInput(raw?: string): Movie["stage"] | undefined {
  const clean = (raw ?? "").trim().toLowerCase();
  if (!clean) return undefined;
  if (VALID_STAGES.has(clean as Movie["stage"])) return clean as Movie["stage"];
  if (clean === "in theaters" || clean === "theater" || clean === "theatrical") return "theaters";
  if (clean === "coming soon" || clean === "upcoming") return "soon";
  if (clean === "recently released" || clean === "past") return "released";
  if (clean === "at home" || clean === "home" || clean === "vod" || clean === "stream") return "streaming";
  return undefined;
}

export function normalizeActionInput(raw?: string): CurationAction {
  const clean = (raw ?? "").trim().toLowerCase();
  if (clean === "hide" || clean === "remove" || clean === "drop" || clean === "skip" || clean === "archive") {
    return "hide";
  }
  return "upsert";
}

export function normalizePlatformInput(raw?: string): string | undefined {
  const clean = (raw ?? "").trim();
  if (!clean) return undefined;
  const parts = clean
    .split(/\s*(?:·|\||,|\/|;)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? [...new Set(parts)].join(" · ") : undefined;
}

export function formatGenreWithBuzz(baseGenre: string, subgenreOverride?: string, festivalBuzz?: string): string {
  const genre = (subgenreOverride ?? "").trim() || baseGenre || "Horror";
  const buzz = (festivalBuzz ?? "").trim();
  if (!buzz) return genre;
  if (genre.toLowerCase().includes(buzz.toLowerCase())) return genre;
  return `${genre} · ${buzz}`;
}

export function splitDelimitedText(input: string, delimiter?: "," | "\t"): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const sep = delimiter ?? (firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",");

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === sep) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\r" && next === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }

    if (ch === "\n" || ch === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

export function parseCurationMatrix(matrix: string[][]): CurationRow[] {
  if (!matrix.length) return [];
  const [headerRow, ...dataRows] = matrix;
  const columnMap = headerRow.map((h) => HEADER_ALIASES[normalizeHeader(h)] ?? null);

  const items: CurationRow[] = [];
  for (const cells of dataRows) {
    const raw: Partial<Record<keyof CurationRow, string>> = {};
    for (let i = 0; i < columnMap.length; i++) {
      const key = columnMap[i];
      if (!key) continue;
      const val = (cells[i] ?? "").trim();
      if (val) raw[key] = val;
    }

    const title = (raw.title ?? "").trim();
    const tmdbNum = raw.tmdbId ? Number(raw.tmdbId) : undefined;
    const validTmdbId = tmdbNum && Number.isInteger(tmdbNum) && tmdbNum > 0 ? tmdbNum : undefined;

    if (!title && !validTmdbId) continue;

    const item: CurationRow = {
      action: normalizeActionInput(raw.action),
      title,
    };

    if (raw.year && /^\d{4}$/.test(raw.year.trim())) item.year = raw.year.trim();
    if (raw.date) item.date = raw.date.trim();
    if (validTmdbId) item.tmdbId = validTmdbId;
    const stage = normalizeStageInput(raw.stage);
    if (stage) item.stage = stage;
    if (raw.genre) item.genre = raw.genre.trim();
    if (raw.festivalBuzz) item.festivalBuzz = raw.festivalBuzz.trim();
    if (raw.availability) item.availability = raw.availability.trim();
    const platform = normalizePlatformInput(raw.platform);
    if (platform) item.platform = platform;
    if (raw.note) item.note = raw.note.trim();
    if (raw.trailerUrl) item.trailerUrl = raw.trailerUrl.trim();
    if (raw.poster) item.poster = raw.poster.trim();
    if (raw.backdrop) item.backdrop = raw.backdrop.trim();
    if (raw.color) item.color = raw.color.trim().toLowerCase();
    if (raw.curatedBy) item.curatedBy = raw.curatedBy.trim();

    items.push(item);
  }

  return items;
}

export function parseCurationText(text: string): CurationRow[] {
  return parseCurationMatrix(splitDelimitedText(text));
}

function escapeCsvCell(value: string | number | undefined): string {
  const str = value === undefined || value === null ? "" : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function movieToCurationRow(movie: Movie, existing?: CurationRow): CurationRow {
  const parsedDate = normalizeDateInput(`${movie.date}, ${movie.year}`, movie.year);
  return {
    action: existing?.action ?? "upsert",
    title: movie.title,
    year: movie.year,
    date: parsedDate?.isoDate ?? movie.date,
    tmdbId: movie.tmdbId ?? existing?.tmdbId,
    stage: movie.stage,
    genre: existing?.genre ?? movie.genre,
    festivalBuzz: existing?.festivalBuzz,
    availability: movie.availability,
    platform: movie.platform,
    note: movie.note,
    trailerUrl: movie.trailerUrl,
    poster: movie.poster,
    backdrop: movie.backdrop,
    color: movie.color,
    curatedBy: existing?.curatedBy,
  };
}

export function formatCurationMatrix(rows: CurationRow[]): string[][] {
  const header = [...SHEET_COLUMNS];
  const body = rows.map((row) => [
    row.action ?? "upsert",
    row.title ?? "",
    row.year ?? "",
    row.date ?? "",
    row.tmdbId ? String(row.tmdbId) : "",
    row.stage ?? "",
    row.genre ?? "",
    row.festivalBuzz ?? "",
    row.availability ?? "",
    row.platform ?? "",
    row.note ?? "",
    row.trailerUrl ?? "",
    row.poster ?? "",
    row.backdrop ?? "",
    row.color ?? "",
    row.curatedBy ?? "",
  ]);
  return [header, ...body];
}

export function serializeCurationCsv(rows: CurationRow[]): string {
  const matrix = formatCurationMatrix(rows);
  return `${matrix.map((line) => line.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function matchesRelease(movie: Movie, row: CurationRow): boolean {
  if (row.tmdbId && movie.tmdbId && row.tmdbId === movie.tmdbId) return true;
  if (!row.title) return false;
  const sameTitle = movie.title.trim().toLowerCase() === row.title.trim().toLowerCase();
  if (!sameTitle) return false;
  if (row.year && movie.year && row.year !== movie.year) return false;
  return true;
}

function defaultAvailabilityForStage(stage: Movie["stage"], platform?: string): string {
  if (stage === "streaming") return "Streaming now";
  if (stage === "theaters") return "In theaters";
  if (stage === "released") return "Recently released";
  return platform ? `Theatrical · ${platform}` : "Theatrical date";
}

export function applyCuration(baseReleases: Movie[], curationRows: CurationRow[]): Movie[] {
  if (!curationRows.length) return baseReleases;

  const result: Movie[] = baseReleases.map((m) => ({ ...m }));

  for (const row of curationRows) {
    const matchIndex = result.findIndex((movie) => matchesRelease(movie, row));

    if (row.action === "hide") {
      if (matchIndex !== -1) {
        result.splice(matchIndex, 1);
      }
      continue;
    }

    if (matchIndex !== -1) {
      const current = result[matchIndex];
      const normalizedDate = row.date || row.year
        ? normalizeDateInput(row.date ?? current.date, row.year ?? current.year)
        : null;
      const nextStage = row.stage ?? current.stage;
      const nextPlatform = row.platform ?? current.platform;
      const nextAvailability =
        row.availability ??
        (row.stage && row.stage !== current.stage
          ? defaultAvailabilityForStage(nextStage, nextPlatform)
          : current.availability);

      result[matchIndex] = {
        ...current,
        title: row.title || current.title,
        date: normalizedDate?.date ?? current.date,
        month: normalizedDate?.month ?? current.month,
        year: normalizedDate?.year ?? row.year ?? current.year,
        genre: formatGenreWithBuzz(current.genre, row.genre, row.festivalBuzz),
        stage: nextStage,
        availability: nextAvailability,
        platform: nextPlatform,
        note: row.note ?? current.note,
        color: row.color || current.color,
        poster: row.poster ?? current.poster,
        backdrop: row.backdrop ?? current.backdrop,
        tmdbId: row.tmdbId ?? current.tmdbId,
        trailerUrl: row.trailerUrl ?? current.trailerUrl,
      };
    } else if (row.title) {
      const normalizedDate = normalizeDateInput(row.date, row.year) ?? {
        date: "Oct 31",
        month: "OCT",
        year: row.year ?? String(new Date().getUTCFullYear()),
      };
      const stage: Movie["stage"] = row.stage ?? (row.platform ? "streaming" : "soon");
      const availability = row.availability ?? defaultAvailabilityForStage(stage, row.platform);
      const color = row.color || COLORS[result.length % COLORS.length];
      const trailerUrl =
        row.trailerUrl ??
        `https://www.youtube.com/results?search_query=${encodeURIComponent(`${row.title} trailer`)}`;

      result.push({
        title: row.title,
        date: normalizedDate.date,
        month: normalizedDate.month,
        year: normalizedDate.year,
        genre: formatGenreWithBuzz("Horror", row.genre, row.festivalBuzz),
        stage,
        availability,
        platform: row.platform,
        note: row.note ?? "A synopsis has not been published yet.",
        color,
        poster: row.poster,
        backdrop: row.backdrop,
        tmdbId: row.tmdbId,
        trailerUrl,
      });
    }
  }

  return result;
}

export function extractSpreadsheetId(input: string): { spreadsheetId: string; gid?: string } {
  const clean = input.trim();
  const urlMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(clean);
  const gidMatch = /[?#&]gid=(\d+)/.exec(clean);
  if (urlMatch) {
    return { spreadsheetId: urlMatch[1], gid: gidMatch?.[1] };
  }
  return { spreadsheetId: clean };
}

export function buildPublishedCsvUrl(sheetOrUrl: string, gid?: string): string {
  const trimmed = sheetOrUrl.trim();
  if (/^https?:\/\//i.test(trimmed) && (/output=csv/i.test(trimmed) || /\/export\b/i.test(trimmed))) {
    return trimmed;
  }
  const parsed = extractSpreadsheetId(trimmed);
  const effectiveGid = gid ?? parsed.gid;
  const params = new URLSearchParams({ format: "csv" });
  if (effectiveGid) params.set("gid", effectiveGid);
  return `https://docs.google.com/spreadsheets/d/${parsed.spreadsheetId}/export?${params.toString()}`;
}
