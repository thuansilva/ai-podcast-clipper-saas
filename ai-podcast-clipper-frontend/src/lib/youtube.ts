/**
 * RN-06: Validação e Extração de Vídeos do YouTube
 */

const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extrai o ID único de 11 caracteres de uma URL do YouTube.
 * Suporta formatos padrão (watch?v=), URLs curtas (youtu.be), embeds e shorts.
 * Retorna null caso a URL seja inválida ou não contenha um ID de vídeo válido.
 */
export function extractYouTubeVideoId(url: string): string | null {
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
        const id = parts[1]; // /embed/<id>, /v/<id>, /shorts/<id>
        return id && YOUTUBE_VIDEO_ID_REGEX.test(id) ? id : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Valida se uma string é uma URL de vídeo suportada do YouTube.
 */
export function isValidYouTubeUrl(url: string): boolean {
  return extractYouTubeVideoId(url) !== null;
}
