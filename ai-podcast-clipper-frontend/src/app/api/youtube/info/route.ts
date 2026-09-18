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
    let title = "";
    let thumbnailUrl = "";
    let durationSeconds = 0;

    // Tentativa primária via youtubei (mais estável)
    try {
      const playerResponse = await fetch("https://www.youtube.com/youtubei/v1/player", {
        method: "POST",
        body: JSON.stringify({
          context: {
            client: {
              hl: "en",
              clientName: "WEB",
              clientVersion: "2.20210721.00.00"
            }
          },
          videoId: videoId
        })
      });
      
      if (playerResponse.ok) {
        const playerData = await playerResponse.json();
        title = playerData?.videoDetails?.title || "";
        if (playerData?.videoDetails?.lengthSeconds) {
          durationSeconds = parseInt(playerData.videoDetails.lengthSeconds, 10);
        }
        if (playerData?.videoDetails?.thumbnail?.thumbnails?.length > 0) {
          const thumbs = playerData.videoDetails.thumbnail.thumbnails;
          thumbnailUrl = thumbs[thumbs.length - 1].url;
        }
      }
    } catch (err) {
      console.error("youtubei fetch failed", err);
    }

    // Fallback para oEmbed se faltar title ou thumbnail
    if (!title || !thumbnailUrl) {
      const oembedResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedResponse.ok) {
        const oembedData = await oembedResponse.json();
        title = title || oembedData.title || "";
        thumbnailUrl = thumbnailUrl || oembedData.thumbnail_url || "";
      } else if (!title) {
        throw new Error("Video not found or private");
      }
    }

    return NextResponse.json({
      title,
      durationSeconds,
      thumbnailUrl,
    });
  } catch (error: unknown) {
    console.error("Failed to fetch youtube info:", error);
    return NextResponse.json({ error: "Failed to fetch video info" }, { status: 500 });
  }
}
