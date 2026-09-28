import { z } from "zod";

const transcriptWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const updateClipSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  subtitlePreset: z.enum(["HORMOZI", "MINIMAL", "NEON"]).optional(),
  transcriptWords: z.array(transcriptWordSchema).optional(),
});
