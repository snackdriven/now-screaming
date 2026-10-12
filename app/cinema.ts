import type { Movie } from "./releases";

export type CinemaView = "lobby" | "theaters" | "home" | "watched";
const months = [
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
];
export function movieTime(movie: Movie) {
  return new Date(
    Number(movie.year),
    months.indexOf(movie.month.toUpperCase()),
    Number(movie.date.split(" ")[1]),
  ).getTime();
}
export function providers(movie: Movie) {
  return [
    ...new Set(
      (movie.platform ?? "")
        .split(" · ")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}
export function rentalOnly(movie: Movie) {
  return /rent|buy/i.test(movie.availability);
}

export function cinemaPool(
  movies: Movie[],
  view: CinemaView,
  filter: string,
  query: string,
  watched: string[],
) {
  const needle = query.trim().toLowerCase();
  return movies
    .filter((movie) => {
      const inView =
        view === "watched"
          ? watched.includes(movie.title)
          : view === "home"
            ? movie.stage === "streaming"
            : movie.stage !== "streaming";
      const inFilter =
        view === "watched" ||
        filter === "all" ||
        (filter === "subscription"
          ? !rentalOnly(movie)
          : filter === "rent"
            ? rentalOnly(movie)
            : movie.stage === filter);
      return (
        inView &&
        inFilter &&
        (!needle ||
          [movie.title, movie.genre, movie.note, movie.platform ?? ""].some(
            (value) => value.toLowerCase().includes(needle),
          ))
      );
    })
    .sort((a, b) => movieTime(a) - movieTime(b));
}

export function selectFeature(
  movies: Movie[],
  view: CinemaView,
  filter: string,
  chosenTitle: string | null = null,
) {
  const chosen = chosenTitle
    ? movies.find((movie) => movie.title === chosenTitle)
    : undefined;
  if (chosen) return chosen;
  const candidates = cinemaPool(movies, view, filter, "", []);
  const preferred =
    view === "home"
      ? candidates.filter((movie) => !rentalOnly(movie))
      : candidates;
  return (
    preferred.find((movie) => movie.poster && movie.backdrop) ??
    preferred.find((movie) => movie.poster) ??
    candidates[0]
  );
}
