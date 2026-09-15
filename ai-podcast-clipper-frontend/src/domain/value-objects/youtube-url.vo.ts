import { InvalidYouTubeUrlError } from "../errors/invalid-youtube-url-error";

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Value Object: YouTubeUrl
 * Encapsula a validação, extração do ID e integridade de uma URL do YouTube.
 */
export class YouTubeUrl {
  private readonly _value: string;
  private readonly _videoId: string;

  private constructor(rawUrl: string, videoId: string) {
    this._value = rawUrl;
    this._videoId = videoId;
  }

  public static create(rawUrl: string): YouTubeUrl {
    const videoId = YouTubeUrl.extractVideoId(rawUrl);
    if (!videoId) {
      throw new InvalidYouTubeUrlError(rawUrl);
    }
    return new YouTubeUrl(rawUrl.trim(), videoId);
  }

  public static tryCreate(rawUrl: string): YouTubeUrl | null {
    const videoId = YouTubeUrl.extractVideoId(rawUrl);
    if (!videoId) {
      return null;
    }
    return new YouTubeUrl(rawUrl.trim(), videoId);
  }

  public static isValid(rawUrl: string): boolean {
    return YouTubeUrl.extractVideoId(rawUrl) !== null;
  }

  public static extractVideoId(url: string): string | null {
    if (!url || typeof url !== "string") {
      return null;
    }

    const trimmed = url.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const urlToParse =
        trimmed.startsWith("http://") || trimmed.startsWith("https://")
          ? trimmed
          : `https://${trimmed}`;

      const parsed = new URL(urlToParse);
      const hostname = parsed.hostname.toLowerCase();

      // youtu.be/<id>
      if (hostname === "youtu.be" || hostname.endsWith(".youtu.be")) {
        const pathnameWithoutSlash = parsed.pathname.startsWith("/")
          ? parsed.pathname.slice(1)
          : parsed.pathname;
        const id = pathnameWithoutSlash.split("/")[0];
        return id && YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
      }

      // youtube.com, www.youtube.com, m.youtube.com, etc.
      if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
        if (parsed.pathname === "/watch") {
          const v = parsed.searchParams.get("v");
          return v && YOUTUBE_VIDEO_ID_REGEX.test(v) ? v : null;
        }

        if (
          parsed.pathname.startsWith("/embed/") ||
          parsed.pathname.startsWith("/v/") ||
          parsed.pathname.startsWith("/shorts/")
        ) {
          const parts = parsed.pathname.split("/").filter(Boolean);
          const id = parts[1];
          return id && YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  public get value(): string {
    return this._value;
  }

  public get videoId(): string {
    return this._videoId;
  }

  public get canonicalUrl(): string {
    return `https://www.youtube.com/watch?v=${this._videoId}`;
  }

  public equals(other: YouTubeUrl): boolean {
    return this._videoId === other._videoId;
  }
}

// Funções de conveniência delegadas ao Value Object para retrocompatibilidade
export const extractYouTubeVideoId = (url: string): string | null =>
  YouTubeUrl.extractVideoId(url);

export const isValidYouTubeUrl = (url: string): boolean =>
  YouTubeUrl.isValid(url);
