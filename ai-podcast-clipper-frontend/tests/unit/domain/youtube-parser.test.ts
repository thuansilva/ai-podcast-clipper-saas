import { describe, it, expect } from "vitest";
import {
  extractYouTubeVideoId,
  isValidYouTubeUrl,
} from "~/domain/rules/youtube-parser";

describe("RN-06: youtube-parser", () => {
  describe("isValidYouTubeUrl", () => {
    it("deve validar URLs padrão do YouTube", () => {
      expect(
        isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).toBe(true);
      expect(
        isValidYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")
      ).toBe(true);
      expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
      expect(
        isValidYouTubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")
      ).toBe(true);
    });

    it("deve rejeitar URLs inválidas ou de outras plataformas", () => {
      expect(isValidYouTubeUrl("https://vimeo.com/123456")).toBe(false);
      expect(isValidYouTubeUrl("https://google.com")).toBe(false);
      expect(isValidYouTubeUrl("not a url")).toBe(false);
      expect(isValidYouTubeUrl("")).toBe(false);
    });
  });

  describe("extractYouTubeVideoId", () => {
    it("deve extrair o ID de 11 caracteres corretamente", () => {
      expect(
        extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
      ).toBe("dQw4w9WgXcQ");
      expect(
        extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")
      ).toBe("dQw4w9WgXcQ");
      expect(
        extractYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")
      ).toBe("dQw4w9WgXcQ");
    });

    it("deve retornar null para URLs inválidas", () => {
      expect(extractYouTubeVideoId("https://vimeo.com/123456")).toBeNull();
      expect(extractYouTubeVideoId("invalid")).toBeNull();
    });
  });
});
