import { describe, it, expect } from "vitest";
import {
  YouTubeUrl,
  extractYouTubeVideoId,
  isValidYouTubeUrl,
} from "~/domain/value-objects/youtube-url.vo";
import { InvalidYouTubeUrlError } from "~/domain/errors/invalid-youtube-url-error";

describe("YouTubeUrl (Value Object)", () => {
  describe("Criação e Invariantes", () => {
    it("deve instanciar com sucesso para URLs válidas e expor videoId e canonicalUrl", () => {
      const vo = YouTubeUrl.create("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(vo.videoId).toBe("dQw4w9WgXcQ");
      expect(vo.canonicalUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(vo.value).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    it("deve instanciar a partir de URLs encurtadas youtu.be", () => {
      const vo = YouTubeUrl.create("https://youtu.be/dQw4w9WgXcQ");
      expect(vo.videoId).toBe("dQw4w9WgXcQ");
      expect(vo.canonicalUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    });

    it("deve instanciar a partir de YouTube Shorts", () => {
      const vo = YouTubeUrl.create("https://www.youtube.com/shorts/dQw4w9WgXcQ");
      expect(vo.videoId).toBe("dQw4w9WgXcQ");
    });

    it("deve lançar InvalidYouTubeUrlError para URLs inválidas via .create()", () => {
      expect(() => YouTubeUrl.create("https://vimeo.com/123456")).toThrow(
        InvalidYouTubeUrlError
      );
      expect(() => YouTubeUrl.create("invalid-url")).toThrow(
        InvalidYouTubeUrlError
      );
      expect(() => YouTubeUrl.create("")).toThrow(
        InvalidYouTubeUrlError
      );
    });

    it("deve retornar null via .tryCreate() para URLs inválidas", () => {
      expect(YouTubeUrl.tryCreate("https://vimeo.com/123456")).toBeNull();
      expect(YouTubeUrl.tryCreate("texto qualquer")).toBeNull();
      expect(YouTubeUrl.tryCreate("")).toBeNull();
    });

    it("deve comparar igualdade de valor entre dois Value Objects", () => {
      const vo1 = YouTubeUrl.create("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      const vo2 = YouTubeUrl.create("https://youtu.be/dQw4w9WgXcQ");
      const vo3 = YouTubeUrl.create("https://youtu.be/abcdefghijk");

      expect(vo1.equals(vo2)).toBe(true);
      expect(vo1.equals(vo3)).toBe(false);
    });
  });

  describe("Métodos estáticos e conveniência (isValid, extractVideoId)", () => {
    it("deve validar URLs padrão e Shorts", () => {
      expect(YouTubeUrl.isValid("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(YouTubeUrl.isValid("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
      expect(isValidYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
      expect(isValidYouTubeUrl("https://vimeo.com/123456")).toBe(false);
    });

    it("deve extrair ID de 11 caracteres corretamente", () => {
      expect(YouTubeUrl.extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
      expect(extractYouTubeVideoId("https://vimeo.com/123456")).toBeNull();
    });
  });
});
