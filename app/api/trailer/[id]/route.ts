
type Video = { key: string; site: string; type: string; official: boolean };

function youtubeSearch(query: string | null) {
  const term = query ? `${query} trailer` : "horror movie trailer";
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(term)}`;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const apiKey = process.env.TMDB_API_KEY;
  const { id } = await context.params;
  // Every path redirects — a missing/failed trailer lands on a YouTube search, never a dead JSON page.
  const search = youtubeSearch(new URL(request.url).searchParams.get("q"));
  if (!apiKey || !/^\d+$/.test(id)) return Response.redirect(search, 302);

  try {
    const response = await fetch(`https://api.themoviedb.org/3/movie/${id}/videos?api_key=${apiKey}&language=en-US`, {
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error("TMDb request failed");
    const data = await response.json() as { results: Video[] };
    let trailer: Video | undefined;
    let bestScore = 0;
    for (const video of data.results) {
      if (video.site !== "YouTube") continue;

      let score = 0;
      if (video.type === "Trailer") {
        score = video.official ? 3 : 2;
      } else if (video.type === "Teaser") {
        score = 1;
      }

      if (score > bestScore) {
        trailer = video;
        bestScore = score;
        if (bestScore === 3) break;
      }
    }
    return Response.redirect(trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : search, 302);
  } catch {
    return Response.redirect(search, 302);
  }
}
