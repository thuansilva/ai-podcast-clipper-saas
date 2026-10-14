import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetch as undiciFetch } from "undici";
import { downloadYouTubeVideo } from "~/inngest/functions";

/**
 * RF novo ("adicionar mais cortes" / IA sobre um slice): contrato NOVO que o
 * backend Python ainda não implementa (ver handback da tarefa) — o campo
 * `slice` em `DownloadYouTubeRequest` é mutuamente exclusivo com
 * `manual_cuts` e não tem o teto de 60s do `ManualCut` (um slice de IA pode
 * ter vários minutos). A resposta reaproveita o `remapped_ranges` já
 * existente (uma única entrada cobrindo o slice).
 */

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

describe("downloadYouTubeVideo — slice request body (IA sobre um novo trecho)", () => {
  beforeEach(() => {
    vi.mocked(undiciFetch).mockReset();
    vi.mocked(undiciFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        s3_key: S3_KEY,
        title: "t",
        duration: 3600,
        thumbnail: null,
        remapped_ranges: [
          { original_start: 198, original_end: 402, offset_in_output: 0 },
        ],
      }),
    } as unknown as Awaited<ReturnType<typeof undiciFetch>>);
  });

  it("sends slice in the backend wire format ({start, end}), without manual_cuts", async () => {
    await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
      slice: { startTime: 200, endTime: 400 },
    });

    const init = vi.mocked(undiciFetch).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["s3_key", "slice", "url"]);
    expect(body.slice).toEqual({ start: 200, end: 400 });
    expect(body).not.toHaveProperty("manual_cuts");
  });

  it("returns remappedRanges from the response (single merged range covering the slice)", async () => {
    const result = await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
      slice: { startTime: 200, endTime: 400 },
    });

    expect(result.remappedRanges).toEqual([
      { original_start: 198, original_end: 402, offset_in_output: 0 },
    ]);
  });

  it("does not send slice when absent (regression: existing whole-video/manual_cuts callers unaffected)", async () => {
    await downloadYouTubeVideo({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      s3Key: S3_KEY,
    });

    const init = vi.mocked(undiciFetch).mock.calls[0]![1]!;
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).not.toHaveProperty("slice");
  });
});
