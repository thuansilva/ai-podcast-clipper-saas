import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetch as undiciFetch } from "undici";
import { downloadYouTubeVideo } from "~/inngest/functions";

// RNF-SEC-18: the backend's DownloadYouTubeRequest is extra="forbid" — any
// field other than `url`/`s3_key` (e.g. the legacy `s3_bucket`) is a 422,
// and the bucket always comes from the backend's own config.

vi.mock("undici", () => ({
  Agent: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("~/env", () => ({
  env: {
    PROCESS_VIDEO_ENDPOINT: "https://modal.run/process-video",
    YOUTUBE_DOWNLOAD_ENDPOINT: "https://modal.run/download-youtube",
    AUTH_TOKEN: "mock-token",
    S3_BUCKET_NAME: "mock-bucket",
  },
}));

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/infrastructure/factories/use-case-factories", () => ({}));

const S3_KEY = "youtube/3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b/original.mp4";

describe("downloadYouTubeVideo request body", () => {
  beforeEach(() => {
    vi.mocked(undiciFetch).mockReset();
    vi.mocked(undiciFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        s3_key: S3_KEY,
        title: "t",
        duration: 10,
        thumbnail: null,
      }),
    } as unknown as Awaited<ReturnType<typeof undiciFetch>>);
  });

  it("sends only url and s3_key (no s3_bucket)", async () => {
    await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
    });

    const init = vi.mocked(undiciFetch).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["s3_key", "url"]);
    expect(body).not.toHaveProperty("s3_bucket");
    expect(body.s3_key).toBe(S3_KEY);
  });
});
