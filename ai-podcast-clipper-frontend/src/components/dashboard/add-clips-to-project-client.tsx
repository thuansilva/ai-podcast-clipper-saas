"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Clock,
  ExternalLink,
  Film,
  Info,
  Loader2,
  PlusIcon,
  ScissorsIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Slider } from "~/components/ui/slider";
import { UsedRangesTrack } from "~/components/dashboard/used-ranges-track";
import { YouTubeUrl } from "~/domain/value-objects/youtube-url.vo";

import { addClipsToProjectAction } from "~/actions/projects-actions";
import {
  MAX_MANUAL_CUTS,
  MAX_MANUAL_CUT_DURATION_SECONDS,
  manualCutsArraySchema,
} from "~/domain/schemas/manual-cut.schema";
import {
  calculateManualCutsCredits,
  calculateVideoCredits,
} from "~/domain/services/credit-pricing.service";
import {
  clipRangesToContainer,
  findOverlappingRange,
} from "~/domain/services/range-overlap.service";
import { formatTimeInput, parseTimeInput } from "~/lib/time-format";
import {
  defaultCutRange,
  normalizeRange,
  type SecondsRange,
} from "~/lib/cut-slider";
import { analyzeManualCutRows, type ManualCutRow } from "~/lib/manual-cut-rows";
import type { TimeRange } from "~/lib/used-ranges";

type AppendMode = "auto" | "manual";

/** Mesmo padrão do "Fatiador Inteligente": sugestão inicial de 5 minutos
 * (ou o que restar do vídeo, se menor) para o slice novo da IA. */
const DEFAULT_SLICE_SECONDS = 5 * 60;

interface AddClipsToProjectClientProps {
  projectId: string;
  projectName: string;
  youtubeUrl: string;
  thumbnailUrl?: string | null;
  videoDurationSeconds: number;
  /** Intervalos (segundos, absolutos no vídeo ORIGINAL) já usados por
   * clipes existentes do projeto — vem do server component, calculado a
   * partir de `Clip.sourceStartTime`/`sourceEndTime`. */
  usedRanges: TimeRange[];
  userCredits: number;
}

function friendlyErrorMessage(raw?: string): string {
  if (!raw || raw.trim() === "") {
    return "Ocorreu um erro inesperado ao adicionar cortes. Tente novamente.";
  }
  return raw;
}

export function AddClipsToProjectClient({
  projectId,
  projectName,
  youtubeUrl,
  thumbnailUrl,
  videoDurationSeconds,
  usedRanges,
  userCredits,
}: AddClipsToProjectClientProps) {
  const router = useRouter();
  const videoSeconds = Math.floor(videoDurationSeconds);
  // Mesma proteção da tela de detalhes do projeto: o `href` é reconstruído
  // pelo Value Object a partir do ID do vídeo, nunca a partir do valor bruto.
  const validYoutubeUrl = useMemo(() => YouTubeUrl.tryCreate(youtubeUrl), [youtubeUrl]);

  const [mode, setMode] = useState<AppendMode>("auto");
  const [processing, setProcessing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Modo "IA gera mais": slice novo (nunca o vídeo inteiro de novo).
  // Sugestão inicial: logo depois do último trecho já usado.
  const lastUsedEnd = useMemo(
    () => usedRanges.reduce((max, r) => Math.max(max, r.end), 0),
    [usedRanges],
  );
  const [range, setRange] = useState<SecondsRange>(() => {
    const start = Math.min(lastUsedEnd, Math.max(0, videoSeconds - 1));
    const end = Math.min(start + DEFAULT_SLICE_SECONDS, videoSeconds);
    return [start, Math.max(start + 1, end)];
  });
  const [startSec, endSec] = range;
  const autoCost = calculateVideoCredits(endSec - startSec);
  const excludedFromSlice = useMemo(
    () => clipRangesToContainer(usedRanges, { start: startSec, end: endSec }),
    [usedRanges, startSec, endSec],
  );

  // Modo manual: mesmo editor de linhas do "Fatiador"/criação de projeto,
  // mas com bloqueio adicional de sobreposição contra `usedRanges`.
  const rowCounter = useRef(1);
  const newRow = (): ManualCutRow => ({
    id: `append-cut-${rowCounter.current++}`,
    start: "",
    end: "",
    title: "",
  });
  const [cutRows, setCutRows] = useState<ManualCutRow[]>(() => [newRow()]);
  const [sliderPos, setSliderPos] = useState<Record<string, SecondsRange>>({});
  const sliderOf = (id: string): SecondsRange =>
    sliderPos[id] ?? defaultCutRange(0, videoSeconds);

  const manualAnalysis = useMemo(
    () => analyzeManualCutRows(cutRows, videoDurationSeconds),
    [cutRows, videoDurationSeconds],
  );

  // Sobreposição com clipes JÁ EXISTENTES (diferente do aviso de
  // sobreposição entre cortes novos, que `analyzeManualCutRows` já cobre e
  // continua apenas como aviso): aqui é bloqueio, nunca só aviso.
  const usedRangeOverlapByRowId = useMemo(() => {
    const map: Record<string, TimeRange> = {};
    for (const cut of manualAnalysis.cuts) {
      const overlap = findOverlappingRange(
        { start: cut.startTime, end: cut.endTime },
        usedRanges,
      );
      if (overlap && cut.id) map[cut.id] = overlap;
    }
    return map;
  }, [manualAnalysis.cuts, usedRanges]);
  const hasUsedRangeOverlap = Object.keys(usedRangeOverlapByRowId).length > 0;

  const updateRow = (id: string, patch: Partial<ManualCutRow>) => {
    setCutRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (patch.start === undefined && patch.end === undefined) return;
    const row = cutRows.find((r) => r.id === id);
    if (!row) return;
    const s0 = parseTimeInput(patch.start ?? row.start);
    const e0 = parseTimeInput(patch.end ?? row.end);
    if (
      s0 !== null &&
      e0 !== null &&
      e0 > s0 &&
      e0 - s0 <= MAX_MANUAL_CUT_DURATION_SECONDS &&
      e0 <= videoSeconds
    ) {
      setSliderPos((pos) => ({ ...pos, [id]: [s0, e0] }));
    }
  };
  const moveSlider = (id: string, values: number[]) => {
    const next = normalizeRange(
      sliderOf(id),
      values,
      videoSeconds,
      MAX_MANUAL_CUT_DURATION_SECONDS,
    );
    setSliderPos((pos) => ({ ...pos, [id]: next }));
    setCutRows((rows) =>
      rows.map((r) =>
        r.id === id
          ? { ...r, start: formatTimeInput(next[0]), end: formatTimeInput(next[1]) }
          : r,
      ),
    );
  };
  const addRow = () => {
    if (cutRows.length >= MAX_MANUAL_CUTS) return;
    const row = newRow();
    const lastEnd = manualAnalysis.cuts.reduce((m, c) => Math.max(m, c.endTime), 0);
    setSliderPos((pos) => ({ ...pos, [row.id]: defaultCutRange(lastEnd, videoSeconds) }));
    setCutRows((rows) => [...rows, row]);
  };
  const removeRow = (id: string) => {
    setSliderPos(({ [id]: _removed, ...rest }) => rest);
    setCutRows((rows) =>
      rows.length <= 1
        ? [{ ...rows[0]!, start: "", end: "", title: "" }]
        : rows.filter((r) => r.id !== id),
    );
  };

  const isManual = mode === "manual";
  const manualCost = calculateManualCutsCredits(manualAnalysis.cuts);
  // Prévia de custo: SEMPRE só o incremento (slice novo ou cortes novos),
  // nunca o projeto inteiro.
  const cost = isManual ? manualCost : autoCost;
  const insufficientCredits = cost > userCredits;
  const hasIncompleteRow = manualAnalysis.rows.some((r) => r.incomplete);
  const submitBlocked =
    processing ||
    insufficientCredits ||
    (isManual ? !manualAnalysis.allValid || hasUsedRangeOverlap : endSec <= startSec);

  const handleSubmit = async () => {
    if (cost > userCredits) {
      toast.error(`Você precisa de ${cost} créditos, mas tem apenas ${userCredits}.`);
      return;
    }
    if (isManual) {
      const check = manualCutsArraySchema.safeParse(manualAnalysis.cuts);
      if (!manualAnalysis.allValid || !check.success || hasUsedRangeOverlap) {
        toast.error("Corrija os cortes antes de enviar.");
        return;
      }
    } else if (endSec <= startSec) {
      toast.error("Escolha um trecho novo válido para a IA analisar.");
      return;
    }

    setProcessing(true);
    setSubmitError(null);
    try {
      const result = await addClipsToProjectAction(
        projectId,
        isManual
          ? { mode: "manual", manualCuts: manualAnalysis.cuts }
          : { mode: "auto", aiSlice: { startTime: startSec, endTime: endSec } },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Cortes adicionados! Acompanhe o progresso no projeto.");
      router.push(`/dashboard/projects/${projectId}`);
      router.refresh();
    } catch (e: unknown) {
      const message = friendlyErrorMessage(e instanceof Error ? e.message : undefined);
      setSubmitError(message);
      toast.error(message);
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 rounded-xl border border-[var(--linha)] bg-[var(--superficie)] p-4 sm:flex-row sm:items-center sm:gap-5">
          <div className="relative w-full shrink-0 overflow-hidden rounded-lg border border-[var(--linha)] bg-[var(--superficie-2)] sm:w-44">
            <div className="aspect-video">
              {thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- não há remotePatterns configurados para next/image (S3/YouTube); ver convenção em recent-videos-client.tsx
                <img
                  data-testid="append-video-thumbnail"
                  src={thumbnailUrl}
                  alt={`Thumbnail do vídeo original: ${projectName}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div
                  data-testid="append-video-thumbnail-placeholder"
                  className="flex h-full w-full items-center justify-center text-[var(--fumaca)]"
                >
                  <Film className="h-8 w-8" aria-hidden="true" />
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fumaca)]">
              Adicionar cortes
            </p>
            <h1
              className="line-clamp-2 break-words text-base font-semibold leading-snug text-[var(--marfim)] sm:text-lg"
              title={projectName}
            >
              {projectName}
            </h1>
            <div
              data-testid="append-video-meta"
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--fumaca)]"
            >
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {Math.floor(videoSeconds / 60)} min
              </span>
              {validYoutubeUrl && (
                <a
                  data-testid="append-youtube-url"
                  href={validYoutubeUrl.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-sm text-[var(--prata)] underline-offset-4 hover:text-[var(--ouro)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)]"
                >
                  Assistir no YouTube
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="sr-only">(abre em nova aba)</span>
                </a>
              )}
            </div>
          </div>
        </div>

        <p className="flex items-start gap-2 text-sm text-[var(--fumaca)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Você só paga pelos cortes novos. Os cortes já gerados continuam intactos.
        </p>
      </header>

      {submitError && (
        <p role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-400">
          {submitError}
        </p>
      )}

      <div className="space-y-6 rounded-xl border border-[var(--linha)] bg-[var(--superficie)] p-6">
        <RadioGroup
          aria-label="Como os novos cortes serão definidos"
          value={mode}
          onValueChange={(v) => setMode(v as AppendMode)}
          className="grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {(
            [
              {
                value: "auto",
                label: "IA gera mais: escolha um trecho novo",
                desc: "A IA analisa só o trecho novo que você escolher, nunca o vídeo inteiro de novo.",
              },
              {
                value: "manual",
                label: "Manual: eu defino os cortes novos",
                desc: "Informe início e fim de cada corte novo (até 60s cada).",
              },
            ] as const
          ).map((m) => (
            <div
              key={m.value}
              className={`flex items-start gap-3 rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-[var(--ouro)]/60 ${mode === m.value ? "border-[var(--ouro)] bg-[var(--superficie-2)]" : "border-[var(--linha)] hover:border-[var(--linha-2)]"}`}
            >
              <RadioGroupItem
                id={`append-mode-${m.value}`}
                value={m.value}
                aria-describedby={`append-mode-${m.value}-desc`}
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor={`append-mode-${m.value}`}
                  className="cursor-pointer text-sm font-medium text-[var(--marfim)]"
                >
                  {m.label}
                </Label>
                <p id={`append-mode-${m.value}-desc`} className="text-xs text-[var(--fumaca)]">
                  {m.desc}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>

        {!isManual && (
          <div className="space-y-6" data-testid="append-ai-slice-editor">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--marfim)]">
              <SparklesIcon className="h-4 w-4 text-[var(--ouro)]" />
              Novo trecho para a IA analisar
            </div>
            <UsedRangesTrack usedRanges={usedRanges} max={videoSeconds} />
            <div className="px-2 pt-2 pb-1">
              <Slider
                data-testid="append-ai-slice-slider"
                value={range}
                min={0}
                max={videoSeconds}
                step={1}
                minStepsBetweenThumbs={1}
                thumbLabels={["Início do novo trecho", "Fim do novo trecho"]}
                thumbValueText={(v) => formatTimeInput(v)}
                onValueChange={(val) =>
                  setRange((prev) => normalizeRange(prev, val, videoSeconds))
                }
              />
              <div
                data-testid="append-ai-slice-labels"
                className="mt-4 flex justify-between text-xs font-medium text-[var(--fumaca)]"
              >
                <span>{formatTimeInput(startSec)}</span>
                <span>{formatTimeInput(endSec)}</span>
              </div>
            </div>
            {excludedFromSlice.length > 0 && (
              <p role="status" className="text-xs text-[var(--ouro)]">
                {excludedFromSlice.length === 1
                  ? "1 trecho já usado dentro deste período será pulado automaticamente."
                  : `${excludedFromSlice.length} trechos já usados dentro deste período serão pulados automaticamente.`}
              </p>
            )}
          </div>
        )}

        {isManual && (
          <div className="space-y-4" data-testid="append-manual-cuts-editor">
            <UsedRangesTrack usedRanges={usedRanges} max={videoSeconds} />
            <p id="append-manual-cuts-help" className="text-xs text-[var(--fumaca)]">
              Use mm:ss (ou h:mm:ss em vídeos longos), contados a partir do início do vídeo de{" "}
              {formatTimeInput(videoDurationSeconds)}. Cada corte pode ter no máximo{" "}
              {MAX_MANUAL_CUT_DURATION_SECONDS}s e não pode se sobrepor a um corte já existente.
            </p>
            <div className="space-y-3">
              {cutRows.map((row, i) => {
                const a = manualAnalysis.rows[i]!;
                const n = i + 1;
                const startErrId = `append-cut-${row.id}-start-error`;
                const endErrId = `append-cut-${row.id}-end-error`;
                const titleErrId = `append-cut-${row.id}-title-error`;
                const warnId = `append-cut-${row.id}-warning`;
                const blockId = `append-cut-${row.id}-blocked`;
                const usedOverlap = usedRangeOverlapByRowId[row.id];
                const describe = (...ids: (string | false)[]) =>
                  ids.filter(Boolean).join(" ") || undefined;
                return (
                  <fieldset key={row.id} className="space-y-3 rounded-xl border border-[var(--linha)] p-4">
                    <legend className="px-1 text-sm font-medium text-[var(--marfim)]">
                      Corte novo {n}
                    </legend>
                    <div className="px-2 pt-2 pb-1">
                      <Slider
                        data-testid={`append-cut-slider-${row.id}`}
                        value={sliderOf(row.id)}
                        min={0}
                        max={videoSeconds}
                        step={1}
                        minStepsBetweenThumbs={1}
                        thumbLabels={[
                          `Início do corte novo ${n} (deslizante)`,
                          `Fim do corte novo ${n} (deslizante)`,
                        ]}
                        thumbValueText={(v) => formatTimeInput(v)}
                        onValueChange={(val) => moveSlider(row.id, val)}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor={`append-cut-${row.id}-start`} className="text-xs text-[var(--marfim)]">
                          Início<span className="sr-only"> do corte novo {n}</span>
                        </Label>
                        <Input
                          id={`append-cut-${row.id}-start`}
                          value={row.start}
                          onChange={(e) => updateRow(row.id, { start: e.target.value })}
                          placeholder="mm:ss"
                          autoComplete="off"
                          inputMode="numeric"
                          aria-invalid={!!a.startError}
                          aria-describedby={describe(!!a.startError && startErrId, "append-manual-cuts-help")}
                        />
                        {a.startError && (
                          <p id={startErrId} role="alert" className="text-xs text-red-400">
                            {a.startError}
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`append-cut-${row.id}-end`} className="text-xs text-[var(--marfim)]">
                          Fim<span className="sr-only"> do corte novo {n}</span>
                        </Label>
                        <Input
                          id={`append-cut-${row.id}-end`}
                          value={row.end}
                          onChange={(e) => updateRow(row.id, { end: e.target.value })}
                          placeholder="mm:ss"
                          autoComplete="off"
                          inputMode="numeric"
                          aria-invalid={!!a.endError || !!usedOverlap}
                          aria-describedby={describe(
                            !!a.endError && endErrId,
                            !!usedOverlap && blockId,
                            !!a.overlapWarning && warnId,
                            "append-manual-cuts-help",
                          )}
                        />
                        {a.endError && (
                          <p id={endErrId} role="alert" className="text-xs text-red-400">
                            {a.endError}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end gap-3">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor={`append-cut-${row.id}-title`} className="text-xs text-[var(--marfim)]">
                          Título<span className="sr-only"> do corte novo {n}</span> (opcional)
                        </Label>
                        <Input
                          id={`append-cut-${row.id}-title`}
                          value={row.title}
                          onChange={(e) => updateRow(row.id, { title: e.target.value })}
                          maxLength={200}
                          autoComplete="off"
                          aria-invalid={!!a.titleError}
                          aria-describedby={describe(!!a.titleError && titleErrId)}
                        />
                        {a.titleError && (
                          <p id={titleErrId} role="alert" className="text-xs text-red-400">
                            {a.titleError}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeRow(row.id)}
                        aria-label={`Remover corte novo ${n}`}
                        className="border-[var(--linha-2)] bg-transparent text-[var(--marfim-2)]"
                      >
                        <Trash2Icon className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                    {usedOverlap && (
                      <p id={blockId} role="alert" className="text-xs text-red-400">
                        Este corte se sobrepõe a um clipe já existente ({formatTimeInput(usedOverlap.start)}–
                        {formatTimeInput(usedOverlap.end)}). Ajuste os tempos para continuar.
                      </p>
                    )}
                    {a.overlapWarning && (
                      <p id={warnId} role="status" className="text-xs text-[var(--ouro)]">
                        Aviso: {a.overlapWarning}
                      </p>
                    )}
                  </fieldset>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={addRow}
                disabled={cutRows.length >= MAX_MANUAL_CUTS}
                aria-describedby={cutRows.length >= MAX_MANUAL_CUTS ? "append-manual-cuts-limit" : undefined}
                className="border-[var(--linha-2)] bg-transparent text-[var(--marfim-2)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]"
              >
                <PlusIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                Adicionar corte
              </Button>
              <span className="text-xs text-[var(--fumaca)]">
                {cutRows.length} de {MAX_MANUAL_CUTS} cortes
              </span>
            </div>
            {cutRows.length >= MAX_MANUAL_CUTS && (
              <p id="append-manual-cuts-limit" className="text-xs text-[var(--ouro)]">
                Você atingiu o limite de {MAX_MANUAL_CUTS} cortes por vídeo.
              </p>
            )}
            {hasIncompleteRow && (
              <p role="status" className="text-xs text-[var(--fumaca)]">
                Preencha início e fim de todos os cortes (ou remova os vazios) para continuar.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border border-[var(--ouro)]/30 bg-[var(--ouro)]/10 p-4">
          <div>
            <p className="text-sm font-medium text-[var(--ouro)]">Custo do Incremento</p>
            <p className="text-xs text-[var(--ouro)]/70">
              Você será cobrado apenas pelo que está sendo adicionado agora.
            </p>
          </div>
          <div data-testid="append-processing-cost" className="font-mono text-2xl font-bold text-[var(--ouro)]">
            {cost} <span className="text-sm font-normal">Créditos</span>
          </div>
        </div>
        {insufficientCredits && (
          <p role="alert" className="text-xs text-red-400">
            Créditos insuficientes: você precisa de {cost} e tem {userCredits}.
          </p>
        )}
      </div>

      {/* Região de status sempre montada (live regions só anunciam mudanças
          de conteúdo de um nó já existente). Anuncia o envio em andamento,
          já que o botão fica desabilitado e o texto do botão não muda. */}
      <p role="status" className="sr-only">
        {processing ? "Enviando cortes para processamento…" : ""}
      </p>

      <div className="flex gap-4 pt-4">
        <Button
          variant="outline"
          onClick={() => router.push(`/dashboard/projects/${projectId}`)}
          className="flex-1 border-[var(--linha-2)] bg-transparent text-[var(--marfim-2)] hover:bg-[var(--superficie)] hover:text-[var(--marfim)]"
        >
          Voltar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitBlocked}
          className="w-full flex-2 bg-[var(--ouro)] text-[var(--tinta)] hover:bg-[var(--ouro)]/90"
        >
          {processing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ScissorsIcon className="mr-2 h-4 w-4" />
          )}
          Adicionar cortes
        </Button>
      </div>
    </div>
  );
}
