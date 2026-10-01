"use server";

import { YouTubeUrl } from "~/domain/value-objects/youtube-url.vo";
import { fetchYouTubeVideoInfoSchema } from "~/domain/schemas/youtube-info.schema";

export async function fetchYouTubeVideoInfo(url: string) {
  const parsed = fetchYouTubeVideoInfoSchema.safeParse({ url });
  if (!parsed.success || !YouTubeUrl.isValid(parsed.data.url)) {
    throw new Error("Invalid YouTube URL");
  }

  const ytUrl = YouTubeUrl.tryCreate(parsed.data.url);
  if (!ytUrl) {
    throw new Error("Invalid YouTube URL");
  }

  const videoId = ytUrl.videoId;
  const oembedResponse = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
  
  if (!oembedResponse.ok) {
    throw new Error("Video not found or private");
  }

  const oembedData = (await oembedResponse.json()) as { title?: string; thumbnail_url?: string };
  const title = oembedData.title ?? "";
  const thumbnailUrl = oembedData.thumbnail_url ?? "";

  let durationSeconds = 0;
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
      if (playerData?.videoDetails?.lengthSeconds) {
        durationSeconds = parseInt(playerData.videoDetails.lengthSeconds, 10);
      }
    }
  } catch (err) {
    console.error("Failed to fetch duration from youtubei:", err);
  }

  return { title, durationSeconds, thumbnailUrl };
}
