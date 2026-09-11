import { describe, it, expect } from "vitest";
import { isValidYouTubeUrl, extractYouTubeVideoId } from "~/lib/youtube";

describe("RN-06: Validação e Extração de URLs do YouTube", () => {
  it("deve validar URLs padrão do YouTube", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeUrl("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("deve validar URLs curtas (youtu.be)", () => {
    expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeUrl("http://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("deve validar URLs com parâmetros adicionais", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe(true);
    expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ?t=20&feature=share")).toBe(true);
  });

  it("deve invalidar URLs não pertencentes ao YouTube ou malformadas", () => {
    expect(isValidYouTubeUrl("https://vimeo.com/123456")).toBe(false);
    expect(isValidYouTubeUrl("texto aleatório")).toBe(false);
    expect(isValidYouTubeUrl("")).toBe(false);
    expect(isValidYouTubeUrl("https://youtube.com")).toBe(false);
    expect(isValidYouTubeUrl("https://youtube.com/feed/subscriptions")).toBe(false);
  });

  it("deve extrair o ID do vídeo corretamente", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ?si=abcdef12345")).toBe("dQw4w9WgXcQ");
  });

  it("deve retornar null ao tentar extrair ID de URL inválida", () => {
    expect(extractYouTubeVideoId("https://vimeo.com/123456")).toBeNull();
    expect(extractYouTubeVideoId("texto aleatório")).toBeNull();
    expect(extractYouTubeVideoId("")).toBeNull();
  });
});
