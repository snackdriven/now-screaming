"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { Movie } from "./releases";
import {
  cinemaPool,
  movieTime,
  providers,
  rentalOnly,
  selectFeature,
  type CinemaView,
} from "./cinema";
import snapshot from "./fallback-releases.json";

const art = "/design/";
type HomeProps = {
  dataUrl?: string;
  resolveTrailer?: (movie: Movie) => string | undefined;
};
const defaultTrailer = (movie: Movie) =>
  movie.tmdbId
    ? `/api/trailer/${movie.tmdbId}?q=${encodeURIComponent(movie.title)}`
    : movie.trailerUrl;
const iconPaths: Record<string, string> = {
  lamp: "M8 3h8l3 8H5l3-8ZM12 11v6M8 21h8M10 17h4v4",
  ticket: "M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6ZM9 6v12",
  tv: "M4 7h16v14H4V7ZM8 2l4 5 4-5",
  check: "m3 12 4 4L17 6m-5 10 3 3 7-9",
  play: "m8 4 12 8-12 8V4Z",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  sun: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  bell: "M6 17h12l-2-3V9a4 4 0 0 0-8 0v5l-2 3ZM10 21h4M3 6l2-2m14 0 2 2",
};
function Icon({ name }: { name: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
function Poster({ movie, className }: { movie: Movie; className: string }) {
  return movie.poster ? (
    <img
      className={className}
      src={movie.poster}
      alt={`${movie.title} poster`}
      loading="lazy"
    />
  ) : (
    <div className={`${className} ns-no-poster`}>{movie.title}</div>
  );
}

const memoryStorage = new Map<string, string>();
function readStorage(key: string, fallback: string) {
  try {
    return localStorage.getItem(key) ?? memoryStorage.get(key) ?? fallback;
  } catch {
    return memoryStorage.get(key) ?? fallback;
  }
}
function writeStorage(key: string, value: string) {
  memoryStorage.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Keep the current session usable. */
  }
  window.dispatchEvent(new Event("ns:storage"));
}
function subscribeStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("ns:storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("ns:storage", callback);
  };
}

export default function Home({
  dataUrl = "/api/releases",
  resolveTrailer = defaultTrailer,
}: HomeProps = {}) {
  const [view, setView] = useState<CinemaView>("lobby");
  const [lastView, setLastView] = useState<CinemaView>("theaters");
  const [filter, setFilter] = useState("soon");
  const [query, setQuery] = useState("");
  const savedWatched = useSyncExternalStore(
    subscribeStorage,
    () => readStorage("ns:watched", "[]"),
    () => "[]",
  );
  const watched = useMemo(() => {
    try {
      const value: unknown = JSON.parse(savedWatched);
      return Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }, [savedWatched]);
  const savedTheme = useSyncExternalStore(
    subscribeStorage,
    () => readStorage("ns:theme", "dark"),
    () => "dark",
  );
  const theme = savedTheme === "light" ? "light" : "dark";
  const [movies, setMovies] = useState<Movie[]>(snapshot.releases as Movie[]);
  const [chosenTitle, setChosenTitle] = useState<string | null>(null);
  const [sourceStatus, setSourceStatus] = useState<"loading" | "ok" | "error">(
    "loading",
  );
  const [updatedAt, setUpdatedAt] = useState(snapshot.updatedAt);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(dataUrl, { signal: controller.signal, cache: "no-store" })
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("Release feed unavailable")),
      )
      .then((payload: { releases?: Movie[]; updatedAt?: string }) => {
        if (!Array.isArray(payload.releases))
          throw new Error("Invalid release feed");
        setMovies(payload.releases);
        setUpdatedAt(payload.updatedAt ?? "");
        setSourceStatus("ok");
      })
      .catch(() => {
        if (!controller.signal.aborted) setSourceStatus("error");
      });
    return () => controller.abort();
  }, [dataUrl, retry]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key === "?" &&
        !(event.target as HTMLElement)?.closest(
          "input,textarea,[contenteditable]",
        )
      )
        window.open(
          "https://github.com/snackdriven/now-screaming",
          "_blank",
          "noopener,noreferrer",
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const feature = selectFeature(
    movies,
    view === "watched" ? lastView : view,
    filter,
    chosenTitle,
  );
  const pool = useMemo(() => {
    const basePool = cinemaPool(movies, view, filter, query, watched);
    return view === "watched" || !feature
      ? basePool
      : basePool.filter((movie) => movie.title !== feature.title);
  }, [movies, view, filter, query, watched, feature]);
  const lobbyMovie = selectFeature(movies, "theaters", "soon");
  const homeTicket = feature?.stage === "streaming";
  const ticketProvider = feature
    ? (providers(feature).sort((a, b) => a.length - b.length)[0] ??
      "Availability below")
    : "";
  const themeDestination = theme === "dark" ? "light" : "dark";
  const sourceText =
    sourceStatus === "loading"
      ? "Checking the release feed…"
      : sourceStatus === "error"
        ? "Feed unavailable — showing the saved catalogue"
        : updatedAt
          ? `Updated ${new Date(updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
          : "Release feed loaded";
  const options =
    view === "home"
      ? [
          ["all", "All at home"],
          ["subscription", "Subscription streaming"],
          ["rent", "Rent or buy"],
        ]
      : view === "watched"
        ? [["all", "All watched"]]
        : [
            ["all", "All theatrical"],
            ["theaters", "In theaters"],
            ["soon", "Coming soon"],
            ["released", "Recently released"],
          ];
  function navigate(
    destination: CinemaView,
    stage = destination === "theaters" ? "soon" : "all",
    chosen: string | null = null,
  ) {
    setView(destination);
    setFilter(stage);
    setChosenTitle(chosen);
    setQuery("");
    if (destination === "home" || destination === "theaters")
      setLastView(destination);
  }
  function openMovie(movie: Movie) {
    navigate(
      movie.stage === "streaming" ? "home" : "theaters",
      movie.stage === "streaming" ? "all" : movie.stage,
      movie.title,
    );
  }
  function pickMovie() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const choices = movies.filter(
      (movie) =>
        !watched.includes(movie.title) &&
        ((movie.stage === "streaming" && !rentalOnly(movie)) ||
          (movie.stage === "soon" && movieTime(movie) >= today.getTime())),
    );
    const pool = choices.length ? choices : movies;
    if (pool.length) openMovie(pool[Math.floor(Math.random() * pool.length)]);
  }
  const toggleWatched = (title: string) =>
    writeStorage(
      "ns:watched",
      JSON.stringify(
        watched.includes(title)
          ? watched.filter((value) => value !== title)
          : [...watched, title],
      ),
    );
  function watchButton(movie: Movie) {
    const marked = watched.includes(movie.title);
    return (
      <button
        onClick={() => toggleWatched(movie.title)}
        aria-pressed={marked}
        aria-label={`${marked ? "Unmark" : "Mark"} ${movie.title} as watched`}
      >
        {marked ? "Watched ✓" : "+ Watched"}
      </button>
    );
  }
  function trailer(movie: Movie) {
    const url = resolveTrailer(movie);
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer">
        Trailer ↗
      </a>
    ) : null;
  }

  return (
    <div id="ns-preview" data-theme={theme} data-view={view}>
      <Sidebar view={view} watched={watched} sourceText={sourceText} navigate={navigate as (dest: CinemaView) => void} />
      <main id="ns-main" className="ns-main">
        <Topbar themeDestination={themeDestination} />
        {view === "lobby" ? (
          <Lobby
            movies={movies}
            lobbyMovie={lobbyMovie}
            pickMovie={pickMovie}
            navigate={navigate as (dest: CinemaView, stage?: string) => void}
            openMovie={openMovie}
          />
        ) : (
          <>
            {feature && (
              <FeatureTicket
                feature={feature}
                homeTicket={homeTicket}
                resolveTrailer={resolveTrailer}
                ticketProvider={ticketProvider}
              />
            )}
            <Tracker
              view={view}
              query={query}
              setQuery={setQuery}
              options={options}
              filter={filter}
              setFilter={setFilter}
              setChosenTitle={setChosenTitle}
              sourceStatus={sourceStatus}
              setSourceStatus={setSourceStatus}
              setRetry={setRetry}
              pool={pool}
              trailer={trailer}
              watchButton={watchButton}
            />
          </>
        )}
      </main>
    </div>
  );
}


function Sidebar({ view, watched, sourceText, navigate }: { view: CinemaView, watched: string[], sourceText: string, navigate: (dest: CinemaView) => void }) {
  return (
    <aside className="ns-sidebar">
      <a
        className="ns-brand"
        href="#ns-main"
        onClick={() => navigate("lobby")}
      >
        <img src={`${art}ghost.webp`} alt="" />
        <span>
          now
          <br />
          screaming<span className="ns-brand-dot">.</span>
        </span>
      </a>
      <nav aria-label="Tracker navigation">
        {(
          [
            ["lobby", "lamp", "Cinema lobby"],
            ["theaters", "ticket", "Theaters & coming soon"],
            ["home", "tv", "Watch at home"],
            ["watched", "check", "Watched"],
          ] as const
        ).map(([destination, icon, label]) => (
          <button
            key={destination}
            className={`ns-nav ${view === destination ? "active" : ""}`}
            data-view={destination}
            aria-pressed={view === destination}
            onClick={() => navigate(destination)}
          >
            <Icon name={icon} />
            <span className="ns-nav-text">{label}</span>
            {destination === "watched" && (
              <span id="ns-count">{watched.length}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="ns-sidebar-note">
        <span className="ns-spark">✦</span>
        <p>
          A little less forgetting.
          <br />A little more screaming.
        </p>
      </div>
      <p className="ns-source">
        U.S. horror releases
        <br />
        <span aria-live="polite">{sourceText}</span>
      </p>
    </aside>
  );
}

function Topbar({ themeDestination }: { themeDestination: string }) {
  return (
    <div className="ns-topbar">
      <span>From theaters to your couch</span>
      <button
        id="ns-theme"
        aria-label={`Switch to ${themeDestination} mode`}
        onClick={() => writeStorage("ns:theme", themeDestination)}
      >
        <Icon name={themeDestination === "light" ? "sun" : "moon"} />
        <span>{themeDestination === "light" ? "Light" : "Dark"} mode</span>
      </button>
    </div>
  );
}

function Lobby({ movies, lobbyMovie, pickMovie, navigate, openMovie }: {
  movies: Movie[],
  lobbyMovie: Movie | undefined,
  pickMovie: () => void,
  navigate: (dest: CinemaView, stage?: string) => void,
  openMovie: (movie: Movie) => void
}) {
  return (
    <section
      className="ns-lobby ns-cinema-lobby"
      aria-label="Cinema lobby"
    >
      <div className="ns-lobby-heading">
        <h1>Lobby under construction.</h1>
      </div>
      <nav className="ns-overhead-board" aria-label="Choose a movie view">
        <button onClick={() => navigate("theaters", "theaters")}>
          <span>Now showing</span>
          <strong>In theaters</strong>
          <small>Make a night of it</small>
        </button>
        <button onClick={() => navigate("theaters", "soon")}>
          <span>Next attractions</span>
          <strong>Coming soon</strong>
          <small>Save the date</small>
        </button>
        <button onClick={() => navigate("home")}>
          <span>Tonight at home</span>
          <strong>Watch at home</strong>
          <small>Streaming, rent & buy</small>
        </button>
      </nav>
      <div className="ns-lobby-gallery">
        <div className="ns-booth">
          <img
            src={`${art}cinema-lobby-oversized-smile.webp`}
            alt="A monochrome paper-doll usher taped over a colorful vintage cinema lobby"
          />
          <button
            className="ns-booth-bell"
            onClick={pickMovie}
            disabled={!movies.length}
            aria-label="Ring the service bell to pick a movie"
          >
            <span className="ns-sr-only">Pick a movie</span>
            <span
              className="ns-craft-tape ns-craft-tape-b"
              aria-hidden="true"
            />
            <span
              className="ns-craft-tape ns-craft-tape-c"
              aria-hidden="true"
            />
          </button>
          <img
            src={`${art}cinema-lobby-oversized-smile-fg.webp`}
            className="ns-booth-fg"
            alt=""
          />
        </div>
        {lobbyMovie && (
          <>
            <button
              className="ns-poster-marquee"
              onClick={() => openMovie(lobbyMovie)}
              aria-label={`View ${lobbyMovie.title} release and trailer`}
            >
              <span
                className="ns-craft-tape ns-craft-tape-a"
                aria-hidden="true"
              />
              <span
                className="ns-craft-tape ns-craft-tape-d"
                aria-hidden="true"
              />
              <Poster movie={lobbyMovie} className="ns-live-poster" />
              <div className="ns-movie-slip" aria-hidden="true" />
            </button>
            <span className="ns-fallen-date">
              <span className="ns-sr-only">
                {lobbyMovie.title} theatrical release:{" "}
              </span>
              <span className="ns-release-value">
                {lobbyMovie.date} <small>{lobbyMovie.year}</small>
              </span>
            </span>
          </>
        )}
      </div>
      <div className="ns-lobby-bottom">
        <div className="ns-lobby-bell">
          <button onClick={pickMovie} disabled={!movies.length}>
            <Icon name="bell" />
            Pick a movie for me
          </button>
          <span>Or ring the brass bell at the box office.</span>
        </div>
        <p className="ns-lobby-footnote">
          Dates and availability for U.S. releases.
        </p>
      </div>
    </section>
  );
}

function FeatureTicket({ feature, homeTicket, resolveTrailer, ticketProvider }: {
  feature: Movie,
  homeTicket: boolean,
  resolveTrailer: (movie: Movie) => string | undefined,
  ticketProvider: string
}) {
  return (
    <header className="ns-header" aria-label="Featured movie ticket">
      <div className="ns-ticket-main">
        {feature.backdrop && (
          <img
            className="ns-backdrop"
            src={feature.backdrop}
            alt=""
          />
        )}
        <div className="ns-ticket-print">
          <div className="ns-ticket-masthead">
            <img
              className="ns-ticket-mascot"
              src={`${art}${homeTicket ? "now-screaming-cozy-ghost.webp" : "ghost.webp"}`}
              alt={
                homeTicket
                  ? "Cozy ghost in a blanket with popcorn"
                  : "Ghost with a calendar and ticket"
              }
            />
            <div>
              <span className="ns-cinema-label">
                {homeTicket ? "Movie night" : "Cinema"}
              </span>
              <span className="ns-ticket-label">Ticket</span>
            </div>
            {resolveTrailer(feature) && (
              <a
                className="ns-ticket-trailer"
                href={resolveTrailer(feature)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="play" />
                <span>Trailer</span>
              </a>
            )}
          </div>
          <h1 className="ns-movie-heading">{feature.title}</h1>
        </div>
      </div>
      <div className="ns-header-stub">
        <div className="ns-stub-print">
          <span className="ns-stub-admission">
            {homeTicket ? "Stay in" : "Admit one"}
          </span>
          <div className="ns-stub-details">
            {homeTicket ? (
              <>
                <span>Watch on</span>
                <strong
                  className={`ns-stub-service ${ticketProvider.length > 18 ? "ns-long-service" : ""}`}
                >
                  {ticketProvider}
                </strong>
                <span>
                  {rentalOnly(feature)
                    ? "Rent or buy"
                    : "Subscription streaming"}
                </span>
              </>
            ) : (
              <>
                <strong className="ns-stub-day">
                  {feature.date.split(" ")[1]}
                </strong>
                <span className="ns-stub-month">
                  {feature.date.split(" ")[0]} {feature.year}
                </span>
                <span>Theatrical release</span>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Tracker({
  view, query, setQuery, options, filter, setFilter, setChosenTitle,
  sourceStatus, setSourceStatus, setRetry, pool, trailer, watchButton
}: {
  view: CinemaView,
  query: string,
  setQuery: (q: string) => void,
  options: string[][],
  filter: string,
  setFilter: (f: string) => void,
  setChosenTitle: (t: string | null) => void,
  sourceStatus: string,
  setSourceStatus: (s: "loading" | "ok" | "error") => void,
  setRetry: React.Dispatch<React.SetStateAction<number>>,
  pool: Movie[],
  trailer: (movie: Movie) => React.ReactNode,
  watchButton: (movie: Movie) => React.ReactNode
}) {
  return (
    <section className="ns-tracker" aria-label="Release tracker">
      <div className="ns-tracker-heading">
        <h2 id="ns-list-heading">
          {view === "home"
            ? "Find tonight’s movie"
            : view === "watched"
              ? "Already survived"
              : "Coming to a theater near you"}
        </h2>
        <label className="ns-search">
          <Icon name="search" />
          <input
            id="ns-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search releases"
            placeholder="Find your next scare"
          />
        </label>
      </div>
      <div
        className="ns-filters"
        role="group"
        aria-label="Release stage"
      >
        {options.map(([stage, label]) => (
          <button
            key={stage}
            aria-pressed={filter === stage}
            onClick={() => {
              setFilter(stage);
              setChosenTitle(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {sourceStatus === "error" && (
        <p className="ns-error" role="status">
          The feed went dark. This is the saved catalogue.
          <button
            onClick={() => {
              setSourceStatus("loading");
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        </p>
      )}
      <div
        id="ns-rows"
        className={view === "home" ? "ns-poster-grid" : ""}
        aria-label="Movies"
      >
        {pool.map((movie, index) =>
          view === "home" ? (
            <article
              className="ns-poster-card"
              key={movie.tmdbId ?? movie.title}
            >
              <Poster movie={movie} className="ns-card-art" />
              <h3>{movie.title}</h3>
              <div className="ns-card-status">
                <strong>
                  {rentalOnly(movie)
                    ? "Rent or buy"
                    : "Subscription streaming"}
                </strong>
                <span className="ns-service ns-provider-list">
                  {providers(movie).map((provider) => (
                    <span className="ns-provider-name" key={provider}>
                      {provider}
                    </span>
                  ))}
                </span>
              </div>
              <div className="ns-card-actions">
                {trailer(movie)}
                {watchButton(movie)}
              </div>
            </article>
          ) : (
            <Fragment key={movie.tmdbId ?? movie.title}>
              {(!index ||
                pool[index - 1].month !== movie.month ||
                pool[index - 1].year !== movie.year) && (
                <h3 className="ns-month-label">
                  {new Date(movieTime(movie)).toLocaleString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </h3>
              )}
              <article className="ns-row">
                <time className="ns-date">
                  <strong>{movie.date.split(" ")[1]}</strong>
                  <span>{movie.date.split(" ")[0]}</span>
                </time>
                <Poster movie={movie} className="ns-poster" />
                <div className="ns-film">
                  <h3>{movie.title}</h3>
                  <p>{movie.genre}</p>
                </div>
                <span className="ns-status">{movie.availability}</span>
                <div className="ns-actions">
                  {trailer(movie)}
                  {watchButton(movie)}
                </div>
              </article>
            </Fragment>
          ),
        )}
        {!pool.length && (
          <p className="ns-empty">
            {query
              ? "No movies match that search."
              : view === "watched"
                ? "Nothing marked watched yet. Save the movies you’ve survived."
                : "No movies in this view yet. Try another filter."}
          </p>
        )}
      </div>
      <footer className="ns-footer">
        <span>Good movies. Bad dreams.</span>
        <span>Movie data: TMDb · U.S. availability: Watchmode</span>
      </footer>
    </section>
  );
}
