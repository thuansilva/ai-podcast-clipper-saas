-- Reparo de dados (bugfix 2026-10-14): o fluxo normal de processamento
-- (`processVideoHandler`) não gravava `Clip.sourceStartTime`/`sourceEndTime`.
-- Projetos do YouTube com cortes manuais criados depois da migration
-- 20261014015607 ficaram com esses campos NULL e caíam em
-- `LegacyClipsMissingSourceRangeError` no "Adicionar cortes".
--
-- Preenche o tempo no vídeo ORIGINAL a partir de `manualCutsJson` SOMENTE
-- quando o mapeamento clipe↔corte é inequívoco:
--   * projeto YOUTUBE com `manualCutsJson` (array, ou string JSON de array);
--   * TODOS os clipes do projeto estão sem source (nenhum lote misturado);
--   * nº de cortes == nº de clipes;
--   * pareando cortes (ordenados por início original) com clipes (ordenados
--     por início no arquivo concatenado — o backend concatena os trechos na
--     ordem do vídeo original), a duração de cada par bate com tolerância de
--     1s.
-- Qualquer outro caso fica NULL (nunca inventado). Idempotente: só toca em
-- linhas ainda NULL.

CREATE OR REPLACE FUNCTION pg_temp.parse_manual_cuts(raw jsonb) RETURNS jsonb AS $$
DECLARE
  parsed jsonb;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  ELSIF jsonb_typeof(raw) = 'array' THEN
    parsed := raw;
  ELSIF jsonb_typeof(raw) = 'string' THEN
    BEGIN
      parsed := (raw #>> '{}')::jsonb;
    EXCEPTION WHEN others THEN
      RETURN NULL;
    END;
  ELSE
    RETURN NULL;
  END IF;
  IF jsonb_typeof(parsed) <> 'array' THEN
    RETURN NULL;
  END IF;
  RETURN parsed;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

WITH candidate_projects AS (
  SELECT uf."id", pg_temp.parse_manual_cuts(uf."manualCutsJson") AS cuts
  FROM "UploadedFile" uf
  WHERE uf."sourceType" = 'YOUTUBE'
    AND uf."manualCutsJson" IS NOT NULL
    AND EXISTS (SELECT 1 FROM "Clip" c WHERE c."uploadedFileId" = uf."id")
    AND NOT EXISTS (
      SELECT 1 FROM "Clip" c
      WHERE c."uploadedFileId" = uf."id"
        AND (c."sourceStartTime" IS NOT NULL OR c."sourceEndTime" IS NOT NULL)
    )
),
cuts AS (
  SELECT
    cp."id" AS project_id,
    (cut ->> 'startTime')::double precision AS cut_start,
    (cut ->> 'endTime')::double precision AS cut_end,
    row_number() OVER (
      PARTITION BY cp."id" ORDER BY (cut ->> 'startTime')::double precision
    ) AS rn,
    count(*) OVER (PARTITION BY cp."id") AS total
  FROM candidate_projects cp
  CROSS JOIN LATERAL jsonb_array_elements(cp.cuts) AS cut
  WHERE cp.cuts IS NOT NULL
    AND jsonb_typeof(cut -> 'startTime') = 'number'
    AND jsonb_typeof(cut -> 'endTime') = 'number'
),
clips AS (
  SELECT
    c."id" AS clip_id,
    c."uploadedFileId" AS project_id,
    c."endTime" - c."startTime" AS clip_duration,
    row_number() OVER (
      PARTITION BY c."uploadedFileId" ORDER BY c."startTime", c."createdAt"
    ) AS rn,
    count(*) OVER (PARTITION BY c."uploadedFileId") AS total
  FROM "Clip" c
  WHERE c."uploadedFileId" IN (SELECT "id" FROM candidate_projects)
),
pairs AS (
  SELECT
    cl.clip_id,
    cl.project_id,
    cu.cut_start,
    cu.cut_end,
    abs((cu.cut_end - cu.cut_start) - cl.clip_duration) <= 1 AS duration_matches
  FROM clips cl
  JOIN cuts cu ON cu.project_id = cl.project_id AND cu.rn = cl.rn
  WHERE cu.total = cl.total
    -- Todos os cortes do projeto precisam ser válidos (numéricos); se algum
    -- foi descartado no CTE `cuts`, o total não bate com o array original.
    AND cu.total = jsonb_array_length(
      (SELECT cp.cuts FROM candidate_projects cp WHERE cp."id" = cl.project_id)
    )
),
unambiguous_projects AS (
  SELECT project_id
  FROM pairs
  GROUP BY project_id
  HAVING bool_and(duration_matches)
)
UPDATE "Clip" c
SET "sourceStartTime" = p.cut_start,
    "sourceEndTime" = p.cut_end
FROM pairs p
WHERE c."id" = p.clip_id
  AND p.project_id IN (SELECT project_id FROM unambiguous_projects)
  AND c."sourceStartTime" IS NULL
  AND c."sourceEndTime" IS NULL;
