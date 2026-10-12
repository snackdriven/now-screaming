# Now Screaming

You are going to remember a horror movie you meant to see in theaters about three weeks after it leaves them.

Six months later you'll find out it quietly landed on streaming, watch the trailer, decide you were always going to see this, and lose track of it again.

This is for that. Your memory did its best: it tripped on flat ground while the killer walked.

**[Enter the queue if you're ready →](https://now-screaming.snackdriven.com/)**

---

## The premise

A vintage cinema lobby and release calendar for horror movies that are:

- Coming to U.S. theaters
- Still in theaters, theoretically
- Suddenly available at home, where they can no longer hurt you with a ticket-price decision

It tracks the theatrical date first, then checks whether something has clawed its way onto subscription streaming or rent/buy. No more finding out *The One You Wanted To See* has been on Peacock for five months because the algorithm decided you needed another true-crime documentary instead.

Think of it as the friend who actually keeps track. The one who calls you at 11pm to say the thing is finally streaming and you have no excuse anymore.

---

## What's in the dark

Start in the cinema lobby, then choose the monthly theatrical calendar, the at-home poster grid, or your watched list. The paper ticket reveals the actual movie backdrop on hover or keyboard focus. Light and dark themes and watched movies persist in your browser. The lobby's poster and fallen date follow the next release in the feed.

Every live title gets:

- **The real poster and backdrop.** Whatever the marketing department actually made, not generic red-and-black skull art.
- **Theatrical timing.** Upcoming and recent U.S. horror, in chronological order. The next release stands at the front of the line as the hero card, first to reach you.
- **Where to watch.** Subscription streaming is called out separately from rent or buy, because those are spiritually different situations.
- **Official trailers.** A link to the best YouTube trailer, and a plain YouTube search as a fallback when nobody has posted one yet.
- **A watched list.** Mark something watched so Future You can't pretend she never saw it. It lives in your browser and survives a reload, like the killer in the last five minutes.

---

## Data sources

Movie metadata, dates, artwork, and trailers come from [TMDb](https://www.themoviedb.org/). U.S. streaming, rental, and purchase availability comes from [Watchmode](https://api.watchmode.com/).

Availability is cached for six hours. This is a horror tracker, not an emergency broadcast system. Nothing here needs to know within the minute that a movie hit Shudder. It can wait until sundown.

---

## Run it locally

You'll need Node.js 22+ and API keys from TMDb and Watchmode.

```bash
npm install
npm run dev
```

Put your keys in `.env.local`:

```bash
TMDB_API_KEY=your_tmdb_key
WATCHMODE_API_KEY=your_watchmode_key
```

Don't commit it. The monster under the bed is always the exposed API key. It has never once been anything else.

---

## Dev

React, TypeScript, Vinext, and Tailwind. It builds two ways, which is one more way than something this small has any right to need.

```bash
npm run build        # Cloudflare Worker artifact — asks the APIs at request time
npm run build:pages  # static site — data baked in at build time
```

The Worker build is the original. `/api/releases` calls TMDb and Watchmode when someone loads the page, so the keys stay server-side.

The static build exists because GitHub Pages can't keep a secret. `scripts/snapshot.mjs` does the API work ahead of time and writes `site/public/data/releases.json`, trailers already resolved to real YouTube URLs. Both builds render the same `Home` component; it just takes a different `dataUrl`. Nothing reaches the browser that a stranger couldn't already read.

That's what's live at the link up top. `.github/workflows/pages.yml` re-bakes and redeploys it on every push to `main`, plus a cron every six hours, so the feed goes stale on a schedule instead of by surprise.

```bash
node --env-file=.env.local scripts/snapshot.mjs   # refresh the baked feed by hand
node --test tests/watched-filter.test.mjs         # release filtering, no DOM needed
npm test                                          # builds, then checks the rendered HTML
```

The watched list uses the existing `ns:watched` localStorage key, so saved movies carry into the redesign and survive browser restarts until site storage is cleared. Marks are keyed on title, so an upstream title change can lose its mark. The theme uses `ns:theme`. If the feed cannot load, the app identifies and displays the saved catalogue in `app/fallback-releases.json` and offers a retry. Public artwork is stored as WebP in both build targets' `design/` asset directories.
