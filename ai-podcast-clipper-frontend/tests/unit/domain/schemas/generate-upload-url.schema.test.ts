import { describe, it, expect } from "vitest";
import {
  generateUploadUrlSchema,
  MAX_VIDEO_UPLOAD_SIZE_BYTES,
} from "~/domain/schemas/generate-upload-url.schema";

describe("generateUploadUrlSchema", () => {
  it("aceita um vídeo mp4 dentro do limite de tamanho", () => {
    const result = generateUploadUrlSchema.safeParse({
      filename: "podcast.mp4",
      contentType: "video/mp4",
      fileSizeBytes: 500 * 1024 * 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita contentType que não é vídeo (ex: imagem)", () => {
    const result = generateUploadUrlSchema.safeParse({
      filename: "foto.png",
      contentType: "image/png",
      fileSizeBytes: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita contentType que não é vídeo (ex: executável disfarçado)", () => {
    const result = generateUploadUrlSchema.safeParse({
      filename: "video.mp4",
      contentType: "application/x-msdownload",
      fileSizeBytes: 1000,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita arquivo acima do limite máximo", () => {
    const result = generateUploadUrlSchema.safeParse({
      filename: "podcast.mp4",
      contentType: "video/mp4",
      fileSizeBytes: MAX_VIDEO_UPLOAD_SIZE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it("aceita exatamente o limite máximo", () => {
    const result = generateUploadUrlSchema.safeParse({
      filename: "podcast.mp4",
      contentType: "video/mp4",
      fileSizeBytes: MAX_VIDEO_UPLOAD_SIZE_BYTES,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita tamanho zero ou negativo", () => {
    expect(
      generateUploadUrlSchema.safeParse({
        filename: "x.mp4",
        contentType: "video/mp4",
        fileSizeBytes: 0,
      }).success
    ).toBe(false);

    expect(
      generateUploadUrlSchema.safeParse({
        filename: "x.mp4",
        contentType: "video/mp4",
        fileSizeBytes: -1,
      }).success
    ).toBe(false);
  });
});
