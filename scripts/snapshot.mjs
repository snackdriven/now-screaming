// Build-time data snapshot for the static GitHub Pages build.
// Runs the same logic as app/api/releases/route.ts using the secret TMDb/Watchmode keys,
// resolves each trailer to a direct YouTube URL, and writes pages/public/data/releases.json.
// The keys live only in CI (GitHub Actions secrets), never in the shipped browser bundle.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const TMDB = process.env.TMDB_API_KEY;
const WATCHMODE = process.env.WATCHMODE_API_KEY;
if (!TMDB) {
  console.error("TMDB_API_KEY is required (set it as a GitHub Actions secret, or use --env-file locally).");
  process.exit(1);
}

const genreNames = { 27: "Horror", 53: "Thriller", 9648: "Mystery", 878: "Sci-fi horror", 14: "Fantasy horror" };
const colors = ["violet", "blood", "acid", "ember", "sand"];

function displayDate(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function shortNote(overview) {
  const synopsis = (overview || "").trim();
  if (!synopsis) return "A synopsis has not been published yet.";
  if (synopsis.length <= 220) return synopsis;
  return `${synopsis.slice(0, 217).replace(/\s+\S*$/, "").trim()}…`;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

async function nowPlayingIds() {
  try {
    const pages = await Promise.all([1, 2, 3].map((page) =>
      getJson(`https://api.themoviedb.org/3/movie/now_playing?${new URLSearchParams({ api_key: TMDB, language: "en-US", region: "US", page: String(page) })}`)
        .catch(() => ({ results: [] })),
    ));
    return new Set(pages.flatMap((page) => (page.results || []).map((movie) => movie.id)));
  } catch {
    return new Set();
  }
}

async function homeAvailability(id) {
  if (!WATCHMODE) return null;
  try {
    const titleId = `movie-${id}`;
    const sources = await getJson(`https://api.watchmode.com/v1/title/${titleId}/sources/?apiKey=${WATCHMODE}`);
    const us = (sources || []).filter((source) => source.region === "US");
    const subscription = us.filter((source) => source.type === "sub" || source.type === "free");
    const home = subscription.length ? subscription : us.filter((source) => source.type === "rent" || source.type === "buy");
    if (!home.length) return null;
    return {
      availability: subscription.length ? "Streaming now" : "Rent or buy",
      platform: [...new Set(home.map((source) => source.name))].join(" · "),
    };
  } catch {
    return null;
  }
}

async function trailerUrl(id, title) {
  const fallback = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} trailer`)}`;
  try {
    const data = await getJson(`https://api.themoviedb.org/3/movie/${id}/videos?api_key=${TMDB}&language=en-US`);
    const videos = data.results || [];
    const trailer = videos.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official)
      ?? videos.find((video) => video.site === "YouTube" && video.type === "Trailer")
      ?? videos.find((video) => video.site === "YouTube" && video.type === "Teaser");
    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : fallback;
  } catch {
    return fallback;
  }
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const day = 24 * 60 * 60 * 1000;
  const recentStart = new Date(Date.now() - 90 * day).toISOString().slice(0, 10);
  const upcomingStart = new Date(Date.now() + day).toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 370 * day).toISOString().slice(0, 10);
  const common = { api_key: TMDB, language: "en-US", region: "US", with_genres: "27", include_adult: "false", page: "1" };
  const recentQuery = new URLSearchParams({ ...common, sort_by: "popularity.desc", "primary_release_date.gte": recentStart, "primary_release_date.lte": today });
  const upcomingQuery = new URLSearchParams({ ...common, sort_by: "popularity.desc", "primary_release_date.gte": upcomingStart, "primary_release_date.lte": nextYear });

  const [recent, upcoming, nowIds] = await Promise.all([
    getJson(`https://api.themoviedb.org/3/discover/movie?${recentQuery}`),
    getJson(`https://api.themoviedb.org/3/discover/movie?${upcomingQuery}`),
    nowPlayingIds(),
  ]);

  const recentMovies = (recent.results || [])
    .filter((movie) => movie.release_date <= today)
    .slice(0, 12)
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  const upcomingMovies = (upcoming.results || [])
    .filter((movie) => movie.release_date > today)
    .slice(0, 12)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const movies = [...recentMovies, ...upcomingMovies].filter((movie, index, all) => all.findIndex((candidate) => candidate.id === movie.id) === index);

  const releases = [];
  for (const [index, movie] of movies.entries()) {
    const [month, dayNumber] = displayDate(movie.release_date).split(" ");
    const genre = movie.genre_ids.map((id) => genreNames[id]).find(Boolean) ?? "Horror";
    const releaseIsPast = movie.release_date <= today;
    const home = releaseIsPast ? await homeAvailability(movie.id) : null;
    const stage = home ? "streaming" : nowIds.has(movie.id) ? "theaters" : releaseIsPast ? "released" : "soon";
    releases.push({
      title: movie.title,
      date: `${month} ${dayNumber}`,
      month: month.toUpperCase(),
      year: movie.release_date.slice(0, 4),
      genre,
      stage,
      availability: home?.availability ?? (stage === "theaters" ? "In theaters" : stage === "released" ? "Recently released" : "Theatrical date"),
      platform: home?.platform,
      note: shortNote(movie.overview),
      color: colors[index % 5],
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : undefined,
      backdrop: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : undefined,
      tmdbId: movie.id,
      trailerUrl: await trailerUrl(movie.id, movie.title),
    });
  }

  const out = "site/public/data/releases.json";
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify({ releases, updatedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`Wrote ${releases.length} releases to ${out}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
