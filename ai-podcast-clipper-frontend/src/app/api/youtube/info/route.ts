import { NextResponse } from "next/server";
import { YouTubeUrl } from "~/domain/value-objects/youtube-url.vo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !YouTubeUrl.isValid(url)) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  const ytUrl = YouTubeUrl.tryCreate(url);
  if (!ytUrl) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  try {
    const videoId = ytUrl.videoId;
    // Busca os dados primários via oEmbed (rápido e oficial para thumbnail e title)
    const oembedResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    
    if (!oembedResponse.ok) {
      throw new Error("Video not found or private");
    }

    const oembedData = await oembedResponse.json();
    const title = oembedData.title;
    const thumbnailUrl = oembedData.thumbnail_url;

    // Para buscar a duração sem bibliotecas pesadas, fazemos um fetch rápido na página HTML
    // e usamos regex para extrair lengthSeconds
    const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    let durationSeconds = 0;
    if (pageResponse.ok) {
      const html = await pageResponse.text();
      const match = html.match(/"lengthSeconds":"(\d+)"/);
      if (match && match[1]) {
        durationSeconds = parseInt(match[1], 10);
      }
    }

    return NextResponse.json({
      title,
      durationSeconds,
      thumbnailUrl,
    });
  } catch (error) {
    console.error("Failed to fetch youtube info:", error);
    return NextResponse.json({ error: "Failed to fetch video info" }, { status: 500 });
  }
}
