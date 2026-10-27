
type TmdbMovie = {
  id: number;
  title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genre_ids: number[];
};


type WatchmodeSource = { name: string; type: "sub" | "free" | "rent" | "buy" | string; region: string };

const genreNames: Record<number, string> = {
  27: "Horror", 53: "Thriller", 9648: "Mystery", 878: "Sci-fi horror", 14: "Fantasy horror",
};

function displayDate(iso: string) {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

function shortNote(overview: string) {
  const synopsis = overview.trim();
  if (!synopsis) return "A synopsis has not been published yet.";
  if (synopsis.length <= 220) return synopsis;
  return `${synopsis.slice(0, 217).replace(/\s+\S*$/, "").trim()}…`;
}

async function getNowPlayingMovieIds(apiKey: string) {
  const pages = [1, 2, 3];
  try {
    const payloads = await Promise.all(pages.map(async (page) => {
      const response = await fetch(
        `https://api.themoviedb.org/3/movie/now_playing?${new URLSearchParams({
          api_key: apiKey,
          language: "en-US",
          region: "US",
          page: String(page),
        })}`,
        { next: { revalidate: 21600 } },
      );
      if (response.ok) {
        return response.json() as Promise<{ results: Array<{ id: number }> }>;
      }
      return { results: [] };
    }));
    const ids = new Set<number>();
    for (const payload of payloads) {
      for (const movie of payload.results) {
        ids.add(movie.id);
      }
    }
    return ids;
  } catch (error) {
    console.error("Could not refresh TMDb now-playing titles", error);
    return new Set<number>();
  }
}

async function getHomeAvailability(tmdbId: number, apiKey: string) {
  const titleId = `movie-${tmdbId}`;
  const sourcesResponse = await fetch(`https://api.watchmode.com/v1/title/${titleId}/sources/?apiKey=${apiKey}`, { next: { revalidate: 21600 } });
  if (!sourcesResponse.ok) return null;
  const allSources = await sourcesResponse.json() as WatchmodeSource[];
  const subscription: WatchmodeSource[] = [];
  const rentOrBuy: WatchmodeSource[] = [];
  for (const source of allSources) {
    if (source.region !== "US") continue;
    if (source.type === "sub" || source.type === "free") {
      subscription.push(source);
    } else if (source.type === "rent" || source.type === "buy") {
      rentOrBuy.push(source);
    }
  }
  const home = subscription.length > 0 ? subscription : rentOrBuy;
  if (!home.length) return null;
  return {
    availability: subscription.length ? "Streaming now" : "Rent or buy",
    platform: [...new Set(home.map((source) => source.name))].join(" · "),
  };
}



function getDiscoverQueries(apiKey: string, today: string) {
  const recentStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const upcomingStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 370 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const commonQuery = {
    api_key: apiKey,
    language: "en-US",
    region: "US",
    with_genres: "27",
    include_adult: "false",
    page: "1",
  };
  const recentQuery = new URLSearchParams({
    ...commonQuery,
    sort_by: "popularity.desc",
    "primary_release_date.gte": recentStart,
    "primary_release_date.lte": today,
  });
  const upcomingQuery = new URLSearchParams({
    ...commonQuery,
    sort_by: "popularity.desc",
    "primary_release_date.gte": upcomingStart,
    "primary_release_date.lte": nextYear,
  });
  return { recentQuery, upcomingQuery };
}

function organizeMovies(recentResults: TmdbMovie[], upcomingResults: TmdbMovie[], today: string) {
  const recentMovies = recentResults
    .filter((movie) => movie.release_date <= today)
    .slice(0, 12)
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  const upcomingMovies = upcomingResults
    .filter((movie) => movie.release_date > today)
    .slice(0, 12)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const map = new Map<number, TmdbMovie>();
  for (const movie of [...recentMovies, ...upcomingMovies]) {
    if (!map.has(movie.id)) {
      map.set(movie.id, movie);
    }
  }
  return Array.from(map.values());
}

async function formatReleases(movies: TmdbMovie[], today: string, nowPlayingMovieIds: Set<number>, watchmodeApiKey: string | undefined) {
  const homeAvailabilities = await Promise.all(
    movies.map((movie) => {
      const releaseIsPast = movie.release_date <= today;
      return releaseIsPast && watchmodeApiKey
        ? getHomeAvailability(movie.id, watchmodeApiKey)
        : null;
    }),
  );

  const releases = [];
  for (const [index, movie] of movies.entries()) {
    const [month, day] = displayDate(movie.release_date).split(" ");
    const genre = movie.genre_ids.map((id) => genreNames[id]).find(Boolean) ?? "Horror";
    const releaseIsPast = movie.release_date <= today;
    const home = homeAvailabilities[index];
    const stage = home
      ? "streaming" as const
      : nowPlayingMovieIds.has(movie.id)
        ? "theaters" as const
        : releaseIsPast
          ? "released" as const
          : "soon" as const;
    const release = {
      title: movie.title,
      date: `${month} ${day}`,
      month: month.toUpperCase(),
      year: movie.release_date.slice(0, 4),
      genre,
      stage,
      availability: home?.availability ?? (stage === "theaters" ? "In theaters" : stage === "released" ? "Recently released" : "Theatrical date"),
      platform: home?.platform,
      note: shortNote(movie.overview),
      color: ["violet", "blood", "acid", "ember", "sand"][index % 5],
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w342${movie.poster_path}` : undefined,
      backdrop: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : undefined,
      tmdbId: movie.id,
    };
    releases.push(release);
  }
  return releases;
}

export async function GET() {
  const apiKey = process.env.TMDB_API_KEY;
  const watchmodeApiKey = process.env.WATCHMODE_API_KEY;
  if (!apiKey) return Response.json({ error: "Movie source is not configured" }, { status: 503 });

  const today = new Date().toISOString().slice(0, 10);
  const { recentQuery, upcomingQuery } = getDiscoverQueries(apiKey, today);

  try {
    const [recentResponse, upcomingResponse, nowPlayingMovieIds] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/discover/movie?${recentQuery}`, {
        next: { revalidate: 21600 },
      }),
      fetch(`https://api.themoviedb.org/3/discover/movie?${upcomingQuery}`, {
        next: { revalidate: 21600 },
      }),
      getNowPlayingMovieIds(apiKey),
    ]);
    if (!recentResponse.ok || !upcomingResponse.ok) {
      throw new Error(`TMDb returned ${recentResponse.status}/${upcomingResponse.status}`);
    }
    const [recentData, upcomingData] = await Promise.all([
      recentResponse.json() as Promise<{ results: TmdbMovie[] }>,
      upcomingResponse.json() as Promise<{ results: TmdbMovie[] }>,
    ]);
    const movies = organizeMovies(recentData.results, upcomingData.results, today);
    const releases = await formatReleases(movies, today, nowPlayingMovieIds, watchmodeApiKey);

    return Response.json({ releases, updatedAt: new Date().toISOString() }, {
      headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("Release feed refresh failed", error);
    return Response.json({ error: "Could not refresh the theatrical feed" }, { status: 502 });
  }
}
