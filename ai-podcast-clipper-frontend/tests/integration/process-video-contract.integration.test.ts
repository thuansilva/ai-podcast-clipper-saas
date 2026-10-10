import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import {
  buildProcessVideoPayload,
  type ProcessVideoPayloadVideo,
} from "~/application/services/process-video-payload.service";
import type { ManualCutDTO } from "~/application/dtos/video-dtos";

/**
 * Contrato v2 de `POST /process_video` (spec
 * docs/historico/superpowers/specs/2026-10-09-manual-cuts-process-video-contract-v2-spec.md,
 * seção 3 e 7). Espelha as regras que o backend Python vai aplicar:
 * RN-PIPE-MANUAL-01..05, 12, 13.
 *
 * Schema local ao teste de propósito: é a "fixture de contrato" do lado
 * frontend. A reconciliação com o schema Pydantic do backend é Fase 2.
 */
const MAX_MANUAL_CUTS = 50;
const MAX_CUT_DURATION_SECONDS = 60;

const manualCutWireSchema = z
  .object({
    title: z.string().optional(),
    start: z.number().nonnegative(),
    end: z.number(),
  })
  .strict()
  .superRefine((cut, ctx) => {
    if (cut.end <= cut.start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "end deve ser maior que start",
        path: ["end"],
      });
    } else if (cut.end - cut.start > MAX_CUT_DURATION_SECONDS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duração do corte excede 60s",
        path: ["end"],
      });
    }
  });

const processVideoContractV2Schema = z
  .object({
    s3_key: z.string().min(1),
    preset: z.string().min(1),
    genre: z.string().optional(),
    aspect_ratio: z.string().optional(),
    auto_zoom: z.boolean().optional(),
    mode: z.enum(["auto", "manual"]),
    manual_cuts: z.array(manualCutWireSchema).max(MAX_MANUAL_CUTS).optional(),
  })
  .strict()
  .superRefine((req, ctx) => {
    const hasCuts = (req.manual_cuts?.length ?? 0) > 0;
    if (req.mode === "manual" && !hasCuts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "mode='manual' requer manual_cuts não vazio",
        path: ["manual_cuts"],
      });
    }
    if (req.mode === "auto" && hasCuts) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manual_cuts não deve ser enviado quando mode='auto'",
        path: ["manual_cuts"],
      });
    }
  });

type ProcessVideoContractV2 = z.infer<typeof processVideoContractV2Schema>;

// Os scripts de teste rodam a partir da raiz de ai-podcast-clipper-frontend.
function loadFixture(name: string): ProcessVideoContractV2 {
  const path = resolve(process.cwd(), "tests/fixtures/contracts", name);
  return JSON.parse(readFileSync(path, "utf-8")) as ProcessVideoContractV2;
}

const manualFixture: ProcessVideoContractV2 = loadFixture(
  "process-video.v2.manual.request.json",
);
const autoFixture: ProcessVideoContractV2 = loadFixture(
  "process-video.v2.auto.request.json",
);

const manualCuts: ManualCutDTO[] = [
  { id: "cut-1", title: "Momento 1", startTime: 10, endTime: 40 },
  { id: "cut-2", title: "Momento 2", startTime: 100, endTime: 160 },
];

const videoWithLayout = (clipModel: string | null): ProcessVideoPayloadVideo => ({
  s3Key: "uploads/file-123/video.mp4",
  subtitlePreset: null,
  genre: null,
  aspectRatio: null,
  autoZoom: null,
  clipModel,
});

describe("Contrato POST /process_video v2 (integração frontend -> payload)", () => {
  describe("o próprio contrato é consistente (validador não é vazio)", () => {
    it("aceita a fixture de request automático", () => {
      expect(processVideoContractV2Schema.safeParse(autoFixture).success).toBe(true);
    });

    it("aceita a fixture de request manual", () => {
      expect(processVideoContractV2Schema.safeParse(manualFixture).success).toBe(true);
    });

    it("rejeita campo desconhecido (RN-PIPE-MANUAL-13 / D2)", () => {
      const result = processVideoContractV2Schema.safeParse({
        ...autoFixture,
        campo_inventado: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejeita mode='manual' sem manual_cuts (RN-PIPE-MANUAL-02 / D5)", () => {
      const result = processVideoContractV2Schema.safeParse({
        ...autoFixture,
        mode: "manual",
      });
      expect(result.success).toBe(false);
    });

    it("rejeita mode='auto' com manual_cuts (RN-PIPE-MANUAL-03)", () => {
      const result = processVideoContractV2Schema.safeParse({
        ...manualFixture,
        mode: "auto",
      });
      expect(result.success).toBe(false);
    });

    it("rejeita corte com duração acima de 60s (RN-PIPE-MANUAL-04)", () => {
      const result = processVideoContractV2Schema.safeParse({
        ...manualFixture,
        manual_cuts: [{ title: "Longo", start: 0, end: 61 }],
      });
      expect(result.success).toBe(false);
    });

    it("rejeita mais de 50 cortes (RN-PIPE-MANUAL-05)", () => {
      const cuts = Array.from({ length: MAX_MANUAL_CUTS + 1 }, (_, i) => ({
        title: `Corte ${i}`,
        start: i * 10,
        end: i * 10 + 5,
      }));
      const result = processVideoContractV2Schema.safeParse({
        ...manualFixture,
        manual_cuts: cuts,
      });
      expect(result.success).toBe(false);
    });
  });

  describe("payload produzido pelo fluxo de processamento (Fase 1 — TDD red)", () => {
    it("pedido de corte manual com layout 'auto' gera payload que cumpre o contrato manual", () => {
      const payload = buildProcessVideoPayload({
        video: videoWithLayout("auto"),
        eventData: { preset: "HORMOZI", mode: "manual", manualCuts },
      });

      // Falha hoje: mode sai como "auto" (valor de layout tem precedência).
      expect(payload.mode).toBe("manual");

      const parsed = processVideoContractV2Schema.safeParse(payload);
      expect(parsed.success).toBe(true);
      expect(payload).toEqual(manualFixture);
    });

    it("pedido automático com layout 'face_focus' gera payload que cumpre o contrato automático", () => {
      const payload = buildProcessVideoPayload({
        video: videoWithLayout("face_focus"),
        eventData: { preset: "HORMOZI", mode: "auto" },
      });

      // Falha hoje: mode sai como "face_focus", fora do enum do contrato v2.
      expect(payload.mode).toBe("auto");
      const parsed = processVideoContractV2Schema.safeParse(payload);
      expect(parsed.success).toBe(true);
      expect(payload).toEqual(autoFixture);
    });
  });
});
