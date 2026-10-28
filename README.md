# Now Screaming

Submitted for your approval: a horror movie you swore you were going to see in theaters. You will remember it exists three weeks after the multiplex pulls it from the marquee.

Six months later you'll hear it landed on streaming, watch the trailer at 1:15 a.m., decide you were always going to watch this tonight, and lose track of it again. It has slipped into the fifth dimension of entertainment distribution, a shadow territory between theatrical exclusivity and a licensing window nobody bothered to announce.

Your memory tripped on flat ground while the killer walked. This is a marquee at the edge of town built to keep watch for you.

**[Step up to the box office](https://now-screaming.snackdriven.com/)**

## The premise

A vintage cinema lobby and release calendar tracking horror across three states of existence:

- Coming to U.S. theaters
- Recently released in theaters
- Available at home via subscription streaming, rental, or purchase

It tracks the theatrical date first, then checks whether a title has clawed its way onto streaming or VOD. No more finding out *The One You Meant To See* has been sitting on Peacock for five months while the algorithm fed you another documentary about a suburban embezzler.

## Inside the lobby

Start under the marquee, then step into the monthly theatrical calendar, the at-home poster grid, or your watched list. Hovering or focusing a paper ticket peels it back to reveal the backdrop. The lobby's hero poster and fallen calendar date follow the next release in the feed.

Each title carries official WebP posters and backdrops (`design/`), chronological U.S. theatrical timing, separate callouts for subscription streaming vs. four-dollar rentals, YouTube trailer links (with a search fallback), and a persistent watched list (`ns:watched` and `ns:theme` in `localStorage`). If the live feed fails in the dark, the lobby falls back to `app/fallback-releases.json`.

Metadata, artwork, and trailers come from [TMDb](https://www.themoviedb.org/). U.S. streaming and VOD availability comes from [Watchmode](https://api.watchmode.com/), cached for six hours on both the Cloudflare Worker and the static build.

## Run it locally

Needs Node.js 22.13+ and keys from TMDb and Watchmode in `.env.local` (keep it out of commits):

```bash
TMDB_API_KEY=your_tmdb_key
WATCHMODE_API_KEY=your_watchmode_key
```

```bash
npm install
npm run dev
```

## Architecture and builds

React, TypeScript, Vinext, and Tailwind, sharing the same `Home` component across two targets:

```bash
npm run build        # Cloudflare Worker: queries TMDb + Watchmode at request time (/api/releases)
npm run build:pages  # GitHub Pages static site: bakes site/public/data/releases.json via scripts/snapshot.mjs
```

`.github/workflows/pages.yml` refreshes the baked feed and redeploys on every push to `main` and every six hours.

```bash
node --env-file=.env.local scripts/snapshot.mjs   # refresh baked feed by hand
node --test tests/watched-filter.test.mjs         # unit tests
npm test                                          # build + HTML check
npm run test:e2e                                  # Playwright desktop + mobile (npx playwright install chromium first)
```

## Commits and releases

No database tables required (`npm run db:generate` only runs if you explicitly set `DB_SCHEMA_PATH`). See [RELEASE.md](RELEASE.md) for Commitizen and SemVer rules.
