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

  // RF-INGEST-10: download parcial no modo manual.
  it("sends manual_cuts in the backend wire format (start/end, not startTime/endTime) when manualCuts is provided", async () => {
    await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
      manualCuts: [
        { id: "cut-1", title: "Momento 1", startTime: 10, endTime: 40 },
        { id: "cut-2", startTime: 100, endTime: 170 },
      ],
    });

    const init = vi.mocked(undiciFetch).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    // `id` never travels to the backend (DownloadYouTubeRequest.manual_cuts
    // reuses ManualCut, extra="forbid" — only title/start/end).
    expect(Object.keys(body).sort()).toEqual(["manual_cuts", "s3_key", "url"]);
    expect(body.manual_cuts).toEqual([
      { title: "Momento 1", start: 10, end: 40 },
      { start: 100, end: 170 },
    ]);
  });

  it("does not send manual_cuts when manualCuts is an empty array (regression: must stay omitted, never an empty array literal)", async () => {
    await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
      manualCuts: [],
    });

    const init = vi.mocked(undiciFetch).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["s3_key", "url"]);
    expect(body).not.toHaveProperty("manual_cuts");
  });

  it("returns remappedRanges/remappedCuts when the response includes remapped_ranges/remapped_cuts", async () => {
    vi.mocked(undiciFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        s3_key: S3_KEY,
        title: "t",
        duration: 3600,
        thumbnail: null,
        remapped_ranges: [
          { original_start: 98, original_end: 132, offset_in_output: 0 },
        ],
        remapped_cuts: [
          {
            original_start: 100,
            original_end: 130,
            new_start: 2,
            new_end: 32,
            title: "Momento 1",
          },
        ],
      }),
    } as unknown as Awaited<ReturnType<typeof undiciFetch>>);

    const result = await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
      manualCuts: [{ title: "Momento 1", startTime: 100, endTime: 130 }],
    });

    expect(result.remappedRanges).toEqual([
      { original_start: 98, original_end: 132, offset_in_output: 0 },
    ]);
    expect(result.remappedCuts).toEqual([
      {
        original_start: 100,
        original_end: 130,
        new_start: 2,
        new_end: 32,
        title: "Momento 1",
      },
    ]);
  });

  it("returns remappedCuts/remappedRanges as undefined when the response omits them (automatic mode / whole-video download)", async () => {
    // beforeEach's default mock response has no remapped_ranges/remapped_cuts.
    const result = await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
    });

    expect(result.remappedRanges).toBeUndefined();
    expect(result.remappedCuts).toBeUndefined();
  });
});
