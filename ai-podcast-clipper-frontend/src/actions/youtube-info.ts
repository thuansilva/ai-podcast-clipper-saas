"use server";

import { YouTubeUrl } from "~/domain/value-objects/youtube-url.vo";

export async function fetchYouTubeVideoInfo(url: string) {
  if (!url || !YouTubeUrl.isValid(url)) {
    throw new Error("Invalid YouTube URL");
  }

  const ytUrl = YouTubeUrl.tryCreate(url);
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

  const pageResponse = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  let durationSeconds = 0;
  if (pageResponse.ok) {
    const html = await pageResponse.text();
    const match = /"lengthSeconds":"(\d+)"/.exec(html);
    if (match?.[1]) {
      durationSeconds = parseInt(match[1], 10);
    }
  }

  return { title, durationSeconds, thumbnailUrl };
}
