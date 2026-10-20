# Now Screaming

You are going to remember a horror movie you meant to see in theaters about three weeks after it leaves them.

Six months later you'll find out it quietly landed on streaming, watch the trailer, decide you were always going to see this, and lose track of it again.

This is for that. Your memory did its best: it tripped on flat ground while the killer walked.

**[Enter the queue if you're ready →](https://now-screaming.snackdriven.com/)**

---

## The premise

A vintage cinema lobby and release calendar for horror movies that are:

- Coming to U.S. theaters
- Recently released in theaters
- Available at home through subscription streaming, rental, or purchase

It tracks the theatrical date first, then checks whether something has clawed its way onto subscription streaming or rent/buy. No more finding out *The One You Wanted To See* has been on Peacock for five months because the algorithm decided you needed another true-crime documentary instead.

---

## What's in the dark

Start in the cinema lobby, then choose the monthly theatrical calendar, the at-home poster grid, or your watched list. The paper ticket reveals the actual movie backdrop on hover or keyboard focus. Light and dark themes and watched movies persist in your browser. The lobby's poster and fallen date follow the next release in the feed.

Every live title gets:

- **Posters and backdrops.** Official artwork for each title.
- **Theatrical timing.** Upcoming and recent U.S. horror, in chronological order. The next release gets the hero card.
- **Where to watch.** Subscription streaming is listed separately from rental and purchase.
- **Official trailers.** A link to the best YouTube trailer, and a plain YouTube search as a fallback when nobody has posted one yet.
- **A watched list.** Mark what you've seen. It saves in your browser and survives a reload.

---

## Data sources

Movie metadata, dates, artwork, and trailers come from [TMDb](https://www.themoviedb.org/). U.S. streaming, rental, and purchase availability comes from [Watchmode](https://api.watchmode.com/).

The Worker caches availability for six hours. The live static site refreshes its feed on a six-hour build schedule, so a new Shudder arrival can take a little while to appear.

---

## Run it locally

You'll need Node.js 22.13+ and API keys from TMDb and Watchmode.

```bash
npm install
npm run dev
```

Put your keys in `.env.local`:

```bash
TMDB_API_KEY=your_tmdb_key
WATCHMODE_API_KEY=your_watchmode_key
```

Keep `.env.local` out of commits; the API keys belong on your machine or in deployment secrets.

---

## Dev

React, TypeScript, Vinext, and Tailwind, with two build targets:

```bash
npm run build        # Cloudflare Worker artifact: asks the APIs at request time
npm run build:pages  # static site: data baked in at build time
```

The Worker build is the original. `/api/releases` calls TMDb and Watchmode when someone loads the page, so the keys stay server-side.

For GitHub Pages, `scripts/snapshot.mjs` does the API work ahead of time and writes `site/public/data/releases.json`, including resolved YouTube trailer URLs. Both builds render the same `Home` component with a different `dataUrl`. The generated feed is public; the API keys stay in the build environment.

The static build is live at the link up top. `.github/workflows/pages.yml` refreshes the feed and redeploys on every push to `main` and on a six-hour schedule.

```bash
node --env-file=.env.local scripts/snapshot.mjs   # refresh the baked feed by hand
node --test tests/watched-filter.test.mjs         # release filtering, no DOM needed
npm test                                          # builds, then checks the rendered HTML
```

The watched list uses the existing `ns:watched` localStorage key, so saved movies carry into the redesign and survive browser restarts until site storage is cleared. Marks are keyed on title, so an upstream title change can lose its mark. The theme uses `ns:theme`. If the feed cannot load, the app identifies and displays the saved catalogue in `app/fallback-releases.json` and offers a retry. Public artwork is stored as WebP in both build targets' `design/` asset directories.

## Commits and releases

See [RELEASE.md](RELEASE.md) for Commitizen commands, SemVer and changelog maintenance.
