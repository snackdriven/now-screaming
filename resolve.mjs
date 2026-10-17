import fs from 'fs';

let content = fs.readFileSync('app/api/releases/route.ts', 'utf8');

// The new formatReleases uses Promise.all like main
const newFormatReleases = `async function formatReleases(movies: TmdbMovie[], today: string, nowPlayingMovieIds: Set<number>, watchmodeApiKey: string | undefined) {
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
      date: \`\${month} \${day}\`,
      month: month.toUpperCase(),
      year: movie.release_date.slice(0, 4),
      genre,
      stage,
      availability: home?.availability ?? (stage === "theaters" ? "In theaters" : stage === "released" ? "Recently released" : "Theatrical date"),
      platform: home?.platform,
      note: shortNote(movie.overview),
      color: ["violet", "blood", "acid", "ember", "sand"][index % 5],
      poster: movie.poster_path ? \`https://image.tmdb.org/t/p/w342\${movie.poster_path}\` : undefined,
      backdrop: movie.backdrop_path ? \`https://image.tmdb.org/t/p/w1280\${movie.backdrop_path}\` : undefined,
      tmdbId: movie.id,
    };
    releases.push(release);
  }
  return releases;
}`;

// Replace the formatReleases definition completely.
const formatReleasesRegex = /async function formatReleases\([\s\S]*?return releases;\n\}/g;
content = content.replace(formatReleasesRegex, newFormatReleases);

// Now remove the conflict markers from GET()
const conflictRegex = /<<<<<<< HEAD\n\n    const movies = organizeMovies\(recentData\.results, upcomingData\.results, today\);\n    const releases = await formatReleases\(movies, today, nowPlayingMovieIds, watchmodeApiKey\);\n\n=======\n[\s\S]*?>>>>>>> origin\/main\n/g;

content = content.replace(conflictRegex, `    const movies = organizeMovies(recentData.results, upcomingData.results, today);
    const releases = await formatReleases(movies, today, nowPlayingMovieIds, watchmodeApiKey);

`);

fs.writeFileSync('app/api/releases/route.ts', content);
