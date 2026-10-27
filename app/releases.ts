export type Movie = {
  title: string;
  date: string;
  month: string;
  year: string;
  genre: string;
  stage: "theaters" | "streaming" | "released" | "soon";
  availability: string;
  platform?: string;
  note: string;
  color: string;
  poster?: string;
  backdrop?: string;
  tmdbId?: number;
  trailerUrl?: string;
};

export type StageFilter = "all" | Movie["stage"];

type PoolInput = {
  movies: Movie[];
  query: string;
  showWatched: boolean;
  watched: string[];
  featureTitle: string;
};

// Everything the release list applies except the stage tab itself. Counts and rows both come from
// this one pool, which is what keeps a tab from advertising rows the list won't render.
export function releasePool({ movies, query, showWatched, watched, featureTitle }: PoolInput): Movie[] {
  const needle = query.trim().toLowerCase();
  const watchedSet = showWatched ? new Set(watched) : null;
  return movies.filter((movie) => {
    // The hero sits above the list, so the list drops the duplicate — except in the watched view,
    // where that's the only place it can appear and it has no watched toggle of its own.
    const notFeature = showWatched || movie.title !== featureTitle;
    if (!notFeature) return false;

    const watchedMatch = !showWatched || watchedSet!.has(movie.title);
    if (!watchedMatch) return false;

    if (!needle) return true;

    return movie.title.toLowerCase().includes(needle) || movie.genre.toLowerCase().includes(needle) || movie.note.toLowerCase().includes(needle) || (movie.platform != null && movie.platform.toLowerCase().includes(needle));
  });
}

export function stageCounts(pool: Movie[]) {
  const counts = {
    all: pool.length,
    theaters: 0,
    streaming: 0,
    released: 0,
    soon: 0,
  };
  for (const movie of pool) {
    switch (movie.stage) {
      case "theaters": counts.theaters++; break;
      case "streaming": counts.streaming++; break;
      case "released": counts.released++; break;
      case "soon": counts.soon++; break;
    }
  }
  return counts;
}

export function applyStage(pool: Movie[], active: StageFilter): Movie[] {
  return active === "all" ? pool : pool.filter((movie) => movie.stage === active);
}
