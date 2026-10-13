"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
  Loader2,
  PlusIcon,
  ScissorsIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  YoutubeIcon,
} from "lucide-react";
import { toast } from "sonner";
import { importYouTubeVideo } from "~/actions/youtube";
import { Slider } from "~/components/ui/slider";
import type { ProcessingOption } from "~/application/services/processing-options.service";
import {
  MAX_MANUAL_CUTS,
  MAX_MANUAL_CUT_DURATION_SECONDS,
  manualCutsArraySchema,
} from "~/domain/schemas/manual-cut.schema";
import {
  calculateManualCutsCredits,
  calculateVideoCredits,
} from "~/domain/services/credit-pricing.service";
import { formatTimeInput, parseTimeInput } from "~/lib/time-format";
import {
  defaultCutRange,
  normalizeRange,
  type SecondsRange,
} from "~/lib/cut-slider";
import {
  analyzeManualCutRows,
  type ManualCutRow,
} from "~/lib/manual-cut-rows";

type CutMode = "auto" | "manual";

interface VideoMetadata {
  title: string;
  durationSeconds: number;
  thumbnailUrl?: string;
}

interface CreateProjectClientProps {
  userCredits: number;
  options?: Record<string, ProcessingOption[]>;
  children?: React.ReactNode;
  initialUrl?: string;
  isConfigRoute?: boolean;
  initialMetadata?: VideoMetadata | null;
  editMode?: boolean;
  editProjectId?: string;
  initialSettings?: {
    preset: string;
    genre: string;
    clipModel: string;
    aspectRatio: string;
    autoZoom: boolean;
    sliceStartTime?: number;
    sliceEndTime?: number;
  };
}

/** Trecho inicial padrão do Fatiador: 5 minutos (ou o vídeo inteiro, se menor). */
const DEFAULT_SLICE_SECONDS = 5 * 60;

function formatDurationLabel(totalSeconds: number): string {
  return formatTimeInput(totalSeconds);
}

function getDefaultOptionValue(options?: ProcessingOption[]): string {
  if (!options || options.length === 0) return "";
  const defaultOption = options.find((o) => o.isDefault);
  return defaultOption ? defaultOption.value : (options[0]?.value || "");
}

export function CreateProjectClient({
  userCredits,
  options = {},
  children,
  initialUrl = "",
  isConfigRoute = false,
  initialMetadata = null,
  editMode = false,
  editProjectId,
  initialSettings,
}: CreateProjectClientProps) {
  const [url, setUrl] = useState(initialUrl);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(initialMetadata);
  const [loadingMeta, setLoadingMeta] = useState(false);

  // Trecho do Fatiador em SEGUNDOS (o banco e as actions também usam segundos).
  const [range, setRange] = useState<SecondsRange>(() => {
    const total = initialMetadata?.durationSeconds
      ? Math.floor(initialMetadata.durationSeconds)
      : undefined;
    const savedStart = initialSettings?.sliceStartTime;
    const savedEnd = initialSettings?.sliceEndTime;
    // 0/0 (ou fim <= início) significa "sem trecho salvo", ex. projeto manual.
    if (savedStart !== undefined && savedEnd !== undefined && savedEnd > savedStart) {
      return [savedStart, total ? Math.min(savedEnd, total) : savedEnd];
    }
    return [0, Math.min(DEFAULT_SLICE_SECONDS, total ?? DEFAULT_SLICE_SECONDS)];
  });
  const [preset, setPreset] = useState(initialSettings?.preset || "HORMOZI");
  // `genre`/`clipModel`/`aspectRatio` guardam apenas a escolha explícita do
  // usuário ("override"); o valor efetivamente usado é derivado durante a
  // renderização, caindo para o default de `options` quando não há escolha
  // própria ainda. Isso substitui o antigo useEffect que fazia a mesma coisa
  // de forma síncrona após a montagem (o que causava uma renderização extra
  // e é desencorajado por `react-hooks/set-state-in-effect`) — e também
  // continua correto se `options` só ficar disponível depois do primeiro
  // render.
  const [genreOverride, setGenreOverride] = useState(
    () => initialSettings?.genre || "",
  );
  const [clipModelOverride, setClipModelOverride] = useState(
    () => initialSettings?.clipModel || "",
  );
  const [aspectRatioOverride, setAspectRatioOverride] = useState(
    () => initialSettings?.aspectRatio || "",
  );
  const genre = genreOverride || getDefaultOptionValue(options.GENRE);
  const clipModel =
    clipModelOverride || getDefaultOptionValue(options.CLIP_MODEL);
  const aspectRatio =
    aspectRatioOverride || getDefaultOptionValue(options.ASPECT_RATIO);
  const [autoZoom, setAutoZoom] = useState(initialSettings?.autoZoom ?? true);

  const [processing, setProcessing] = useState(false);

  // Modo de definição dos cortes (só no fluxo de criação; em `editMode` o
  // seletor não é exibido e o fluxo de retry segue como antes).
  const [cutMode, setCutMode] = useState<CutMode>("auto");
  const rowCounter = useRef(1);
  const newRow = (): ManualCutRow => ({
    id: `cut-${rowCounter.current++}`,
    start: "",
    end: "",
    title: "",
  });
  const [cutRows, setCutRows] = useState<ManualCutRow[]>(() => [newRow()]);
  const isManual = !editMode && cutMode === "manual";

  // Posição do slider de cada corte (segundos), separada do texto digitado:
  // enquanto o texto está inválido/incompleto o slider fica onde estava.
  // Linhas sem entrada usam o padrão (0..30s).
  const [sliderPos, setSliderPos] = useState<Record<string, SecondsRange>>({});
  const videoSeconds = Math.floor(metadata?.durationSeconds ?? 0);
  const sliderOf = (id: string): SecondsRange =>
    sliderPos[id] ?? defaultCutRange(0, videoSeconds);

  const updateRow = (id: string, patch: Partial<ManualCutRow>) => {
    setCutRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (patch.start === undefined && patch.end === undefined) return;
    // Digitar um par válido (início < fim, <= 60s, dentro do vídeo) move o slider.
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
  // Arrastar o slider preenche os dois campos (a linha passa a estar completa).
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
    // Corte novo: sugestão logo depois do fim do último corte válido.
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

  const router = useRouter();

  // useCallback (não só uma função solta no corpo do componente) de propósito:
  // é dependência do useEffect de auto-fetch abaixo, e precisa manter
  // identidade estável entre renders que não mudam `isConfigRoute`/`router`
  // (ambos tipicamente estáveis) para não resetar o debounce do efeito a
  // cada render não relacionado à URL (ex.: usuário editando os cortes
  // manuais) — ver comentário no useEffect.
  const handleFetchMeta = useCallback(
    async (targetUrl: string) => {
      if (!targetUrl) return;

      setLoadingMeta(true);

      if (!isConfigRoute) {
        router.push(`/dashboard/new?url=${encodeURIComponent(targetUrl)}`);
        return;
      }

      try {
        const res = await fetch(
          `/api/youtube/info?url=${encodeURIComponent(targetUrl)}`,
        );
        const data = (await res.json()) as { error?: string; title?: string; durationSeconds?: number; thumbnailUrl?: string; };
        if (!res.ok) throw new Error(data.error || "Failed to fetch metadata");

        setMetadata(data as VideoMetadata);
        const total = Math.floor(data.durationSeconds || DEFAULT_SLICE_SECONDS);
        setRange([0, Math.min(DEFAULT_SLICE_SECONDS, total)]);
        setSliderPos({});
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Erro desconhecido");
      } finally {
        setLoadingMeta(false);
      }
    },
    [isConfigRoute, router],
  );

  // Auto-fetch quando a URL parece ser do YouTube
  useEffect(() => {
    if (metadata && url === initialUrl) return;

    if (
      url &&
      (url.includes("youtube.com/watch") || url.includes("youtu.be/"))
    ) {
      // Debounce simples para evitar múltiplas chamadas se o usuário estiver digitando
      const timer = setTimeout(() => {
        void handleFetchMeta(url);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [url, metadata, initialUrl, handleFetchMeta]);

  const startSec = range[0];
  const endSec = range[1];
  // Mesma regra do Inngest (hold usa o tamanho do trecho em segundos):
  // 1 crédito por minuto ou fração, mínimo 1.
  const autoCost = calculateVideoCredits(endSec - startSec);

  const manualAnalysis = useMemo(
    () => analyzeManualCutRows(cutRows, metadata?.durationSeconds ?? 0),
    [cutRows, metadata?.durationSeconds],
  );
  const manualCost = calculateManualCutsCredits(manualAnalysis.cuts);
  const cost = isManual ? manualCost : autoCost;
  const insufficientCredits = !editMode && cost > userCredits;
  const hasIncompleteRow = manualAnalysis.rows.some((r) => r.incomplete);
  const submitBlocked =
    processing || insufficientCredits || (isManual && !manualAnalysis.allValid);

  const handleSubmit = async () => {
    if (!editMode && (!url || !metadata)) return;

    // For editing, cost doesn't apply (it's already paid, or we just retry)
    // Wait, retry might cost credits if it failed midway? No, retry is for failed projects. 
    // We assume the user already paid, or we handle it in backend. Actually, Inngest handler checks if user has credits again, but let's bypass frontend check for edit.
    if (!editMode && cost > userCredits) {
      toast.error(
        `Você precisa de ${cost} créditos, mas tem apenas ${userCredits}.`,
      );
      return;
    }

    if (isManual) {
      const check = manualCutsArraySchema.safeParse(manualAnalysis.cuts);
      if (!manualAnalysis.allValid || !check.success) {
        toast.error("Corrija os cortes manuais antes de enviar.");
        return;
      }
    }

    setProcessing(true);
    try {
      if (editMode && editProjectId) {
        const { retryProjectAction } = await import("~/actions/projects-actions");
        const res = await retryProjectAction(editProjectId, {
          subtitlePreset: preset,
          clipModel,
          aspectRatio,
          autoZoom,
          sliceStartTime: startSec,
          sliceEndTime: endSec,
        });

        if (!res.success) {
          throw new Error(res.error || "Erro ao reenviar");
        }
        
        toast.success("Projeto atualizado e reenviado!");
        router.push("/dashboard");
        router.refresh();
        return;
      }

      const commonInput = {
        url,
        preset,
        genre: genre || undefined,
        clipModel: clipModel || undefined,
        aspectRatio: aspectRatio || undefined,
        autoZoom,
        thumbnailUrl: metadata?.thumbnailUrl,
      };
      // Modo manual: tempos absolutos em segundos e SEM slice (o Fatiador é
      // para a IA escolher dentro de um trecho; aqui o usuário já escolheu).
      const result = await importYouTubeVideo(
        isManual
          ? { ...commonInput, mode: "manual", manualCuts: manualAnalysis.cuts }
          : {
              ...commonInput,
              sliceStartTime: startSec,
              sliceEndTime: endSec,
              mode: "auto",
            },
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Vídeo enviado para processamento!");
      router.push("/dashboard");
      router.refresh();
    } catch (e: unknown) {
      toast.error((e instanceof Error ? e.message : "Ocorreu um erro ao processar o vídeo."));
      setProcessing(false);
    }
  };

  // NOTA (go-live): o upload direto de arquivo de vídeo foi removido da UI de
  // propósito. A implementação real de upload para o S3 + criação do projeto
  // ainda não existe (ver checklist-go-live.md); exibir o controle enganaria o
  // usuário com uma promessa de funcionalidade que não funciona de fato. O
  // fluxo suportado hoje é somente a importação via YouTube + cortes manuais.

  return (
    <div className="w-full">
      {!metadata ? (
        <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="relative flex flex-col items-center justify-center pt-8 pb-16 w-full mb-12">
            {/* Background huge text */}
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none select-none z-0">
              <h1 className="text-[10rem] md:text-[14rem] font-black text-[var(--superficie-2)]/50 tracking-tighter whitespace-nowrap">
                AI CLIPPER
              </h1>
            </div>

            <div className="relative z-10 w-full max-w-3xl flex flex-col items-center text-center space-y-6">
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--marfim)]">
                Transforme vídeos longos em <span className="text-[var(--ouro)]">Cortes Virais</span>
              </h1>
              
              <p className="text-lg text-[var(--fumaca)] max-w-xl">
                Cole o link do seu vídeo do YouTube e nossa IA cuidará de todo o resto para você.
              </p>

              {/*   Form Area */}
              <div className="w-full max-w-2xl mt-8 relative group">
                <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[var(--ouro)]/0 via-[var(--ouro)]/40 to-[var(--ouro)]/0 blur opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <div className="relative flex items-center bg-[var(--superficie)] rounded-full border border-[var(--linha)] p-2 shadow-2xl focus-within:border-[var(--ouro)] transition-all">
                  <div className="pl-4 pr-2 flex items-center justify-center text-[var(--linha-2)]">
                    <YoutubeIcon className="h-6 w-6 group-focus-within:text-[var(--ouro)] transition-colors" />
                  </div>
                  
                  <input
                    placeholder="Cole o link do YouTube (ex: https://youtube.com/watch?v=...)"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 bg-transparent border-none outline-none text-base md:text-lg text-[var(--marfim)] placeholder:text-[var(--fumaca)]/50 px-2 h-14 w-full"
                  />

                  {loadingMeta && (
                    <div className="pr-4">
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--ouro)]" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <div className="w-full mx-auto">
            {children}
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)] mb-1">
              Configurar Projeto
            </h1>
            <p className="text-sm text-[var(--fumaca)]">
              {isManual
                ? "Defina os cortes, o formato e o estilo das legendas."
                : "Ajuste os parâmetros de corte e deixe a IA fazer o resto."}
            </p>
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-4 space-y-8 duration-500">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-4">
              <div className="overflow-hidden rounded-xl border border-[var(--linha)] bg-[var(--superficie)] shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
<img
                  src={metadata.thumbnailUrl}
                  alt="Thumbnail"
                  className="aspect-video w-full object-cover"
                />
                <div className="p-4">
                  <p className="line-clamp-2 text-sm font-semibold text-[var(--marfim)]">
                    {metadata.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--fumaca)]">
                    Duração total: {formatDurationLabel(metadata.durationSeconds)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 md:col-span-8">
              {!isManual && (
              <div className="space-y-6 rounded-xl border border-[var(--linha)] bg-[var(--superficie)] p-6">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--marfim)]">
                    <ScissorsIcon className="h-5 w-5 text-[var(--ouro)]" />
                    Fatiador Inteligente
                  </h2>
                  <p className="mt-1 text-sm text-[var(--fumaca)]">
                    Deslize para selecionar o trecho que nossa IA deve analisar
                  </p>
                </div>
                <div className="space-y-8">
                  <div className="px-2 pt-4 pb-2">
                    <Slider
                      data-testid="range-slider"
                      value={range}
                      min={0}
                      max={Math.floor(metadata.durationSeconds)}
                      step={1}
                      minStepsBetweenThumbs={1}
                      thumbLabels={["Início do trecho a analisar", "Fim do trecho a analisar"]}
                      thumbValueText={(v) => formatTimeInput(v)}
                      onValueChange={(val) =>
                        setRange((prev) =>
                          normalizeRange(prev, val, Math.floor(metadata.durationSeconds)),
                        )
                      }
                    />
                    <div
                      data-testid="range-labels"
                      className="mt-4 flex justify-between text-xs font-medium text-[var(--fumaca)]"
                    >
                      <span>{formatTimeInput(startSec)}</span>
                      <span>{formatTimeInput(endSec)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-[var(--ouro)]/30 bg-[var(--ouro)]/10 p-4">
                    <div>
                      <p className="text-sm font-medium text-[var(--ouro)]">
                        Custo do Processamento
                      </p>
                      <p className="text-xs text-[var(--ouro)]/70">
                        Você será cobrado apenas pelo trecho fatiado.
                      </p>
                    </div>
                    <div
                      data-testid="processing-cost"
                      className="font-mono text-2xl font-bold text-[var(--ouro)]"
                    >
                      {cost}{" "}
                      <span className="text-sm font-normal">Créditos</span>
                    </div>
                  </div>
                </div>
              </div>
              )}

              {/* Opções de Processamento Dinâmicas */}
              <div className="space-y-6 rounded-xl border border-[var(--linha)] bg-[var(--superficie)] p-6">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--marfim)]">
                    <SlidersHorizontalIcon className="h-5 w-5 text-[var(--ouro)]" />
                    Configurações do Corte
                  </h2>
                  <p className="mt-1 text-sm text-[var(--fumaca)]">
                    {isManual
                      ? "Personalize o formato, foco e estilo dos seus cortes"
                      : "Personalize o formato, foco e estilo dos seus cortes gerados por IA"}
                  </p>
                </div>
                <div className="space-y-6">
                  {!editMode && (
                    <RadioGroup
                      aria-label="Como os cortes serão definidos"
                      value={cutMode}
                      onValueChange={(v) => setCutMode(v as CutMode)}
                      className="grid-cols-1 gap-3 sm:grid-cols-2"
                    >
                      {(
                        [
                          { value: "auto", label: "Automático: a IA escolhe os melhores momentos", desc: "Você escolhe só o trecho do vídeo a analisar." },
                          { value: "manual", label: "Manual: eu defino os cortes", desc: "Você informa início e fim de cada corte (até 60s cada)." },
                        ] as const
                      ).map((m) => (
                        <div
                          key={m.value}
                          className={`flex items-start gap-3 rounded-xl border p-4 transition-all focus-within:ring-2 focus-within:ring-[var(--ouro)]/60 ${cutMode === m.value ? "border-[var(--ouro)] bg-[var(--superficie-2)]" : "border-[var(--linha)] hover:border-[var(--linha-2)]"}`}
                        >
                          <RadioGroupItem
                            id={`cut-mode-${m.value}`}
                            value={m.value}
                            aria-describedby={`cut-mode-${m.value}-desc`}
                            className="mt-0.5"
                          />
                          <div className="space-y-1">
                            <Label
                              htmlFor={`cut-mode-${m.value}`}
                              className="cursor-pointer text-sm font-medium text-[var(--marfim)]"
                            >
                              {m.label}
                            </Label>
                            <p
                              id={`cut-mode-${m.value}-desc`}
                              className="text-xs text-[var(--fumaca)]"
                            >
                              {m.desc}
                            </p>
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  )}

                  {isManual && (
                    <div className="space-y-4" data-testid="manual-cuts-editor">
                      <p id="manual-cuts-help" className="text-xs text-[var(--fumaca)]">
                        Use mm:ss (ou h:mm:ss em vídeos longos), contados a partir
                        do início do vídeo de {formatDurationLabel(metadata.durationSeconds)}.
                        Cada corte pode ter no máximo {MAX_MANUAL_CUT_DURATION_SECONDS}s.
                      </p>
                      <div className="space-y-3">
                        {cutRows.map((row, i) => {
                          const a = manualAnalysis.rows[i]!;
                          const n = i + 1;
                          const startErrId = `cut-${row.id}-start-error`;
                          const endErrId = `cut-${row.id}-end-error`;
                          const titleErrId = `cut-${row.id}-title-error`;
                          const warnId = `cut-${row.id}-warning`;
                          const describe = (...ids: (string | false)[]) =>
                            ids.filter(Boolean).join(" ") || undefined;
                          return (
                            <fieldset
                              key={row.id}
                              className="space-y-3 rounded-xl border border-[var(--linha)] p-4"
                            >
                              <legend className="px-1 text-sm font-medium text-[var(--marfim)]">
                                Corte {n}
                              </legend>
                              <div className="px-2 pt-2 pb-1">
                                <Slider
                                  data-testid={`cut-slider-${row.id}`}
                                  value={sliderOf(row.id)}
                                  min={0}
                                  max={videoSeconds}
                                  step={1}
                                  minStepsBetweenThumbs={1}
                                  thumbLabels={[
                                    `Início do corte ${n} (deslizante)`,
                                    `Fim do corte ${n} (deslizante)`,
                                  ]}
                                  thumbValueText={(v) => formatTimeInput(v)}
                                  onValueChange={(val) => moveSlider(row.id, val)}
                                />
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <Label htmlFor={`cut-${row.id}-start`} className="text-xs text-[var(--marfim)]">
                                    Início<span className="sr-only"> do corte {n}</span>
                                  </Label>
                                  <Input
                                    id={`cut-${row.id}-start`}
                                    value={row.start}
                                    onChange={(e) => updateRow(row.id, { start: e.target.value })}
                                    placeholder="mm:ss"
                                    autoComplete="off"
                                    inputMode="numeric"
                                    aria-invalid={!!a.startError}
                                    aria-describedby={describe(!!a.startError && startErrId, !!a.overlapWarning && warnId, "manual-cuts-help")}
                                  />
                                  {a.startError && (
                                    <p id={startErrId} role="alert" className="text-xs text-red-400">
                                      {a.startError}
                                    </p>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  <Label htmlFor={`cut-${row.id}-end`} className="text-xs text-[var(--marfim)]">
                                    Fim<span className="sr-only"> do corte {n}</span>
                                  </Label>
                                  <Input
                                    id={`cut-${row.id}-end`}
                                    value={row.end}
                                    onChange={(e) => updateRow(row.id, { end: e.target.value })}
                                    placeholder="mm:ss"
                                    autoComplete="off"
                                    inputMode="numeric"
                                    aria-invalid={!!a.endError}
                                    aria-describedby={describe(!!a.endError && endErrId, !!a.overlapWarning && warnId, "manual-cuts-help")}
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
                                  <Label htmlFor={`cut-${row.id}-title`} className="text-xs text-[var(--marfim)]">
                                    Título<span className="sr-only"> do corte {n}</span> (opcional)
                                  </Label>
                                  <Input
                                    id={`cut-${row.id}-title`}
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
                                  aria-label={`Remover corte ${n}`}
                                  className="border-[var(--linha-2)] bg-transparent text-[var(--marfim-2)]"
                                >
                                  <Trash2Icon className="h-4 w-4" aria-hidden="true" />
                                </Button>
                              </div>
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
                          aria-describedby={cutRows.length >= MAX_MANUAL_CUTS ? "manual-cuts-limit" : undefined}
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
                        <p id="manual-cuts-limit" className="text-xs text-[var(--ouro)]">
                          Você atingiu o limite de {MAX_MANUAL_CUTS} cortes por vídeo.
                        </p>
                      )}
                      {hasIncompleteRow && (
                        <p role="status" className="text-xs text-[var(--fumaca)]">
                          Preencha início e fim de todos os cortes (ou remova os vazios) para continuar.
                        </p>
                      )}

                      <div className="flex items-center justify-between rounded-xl border border-[var(--ouro)]/30 bg-[var(--ouro)]/10 p-4">
                        <div>
                          <p className="text-sm font-medium text-[var(--ouro)]">
                            Custo do Processamento
                          </p>
                          <p className="text-xs text-[var(--ouro)]/70">
                            1 crédito por corte válido (até 60s cada).
                          </p>
                        </div>
                        <div
                          data-testid="processing-cost"
                          className="font-mono text-2xl font-bold text-[var(--ouro)]"
                        >
                          {manualCost}{" "}
                          <span className="text-sm font-normal">Créditos</span>
                        </div>
                      </div>
                      {insufficientCredits && (
                        <p role="alert" className="text-xs text-red-400">
                          Créditos insuficientes: você precisa de {manualCost} e tem {userCredits}.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Gênero */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="select-genre"
                        className="text-sm font-medium text-[var(--marfim)]"
                      >
                        Gênero do Conteúdo
                      </Label>
                      <select
                        id="select-genre"
                        aria-label="Gênero do Conteúdo"
                        value={genre}
                        onChange={(e) => setGenreOverride(e.target.value)}
                      >
                        {options.GENRE && options.GENRE.length > 0 ? (
                          options.GENRE.map((opt) => (
                            <option
                              key={opt.id || opt.value}
                              value={opt.value}
                              className="bg-[var(--superficie)] text-[var(--marfim)]"
                            >
                              {opt.label}
                            </option>
                          ))
                        ) : (
                          <option
                            value=""
                            className="bg-[var(--superficie)] text-[var(--marfim)]"
                          >
                            Padrão
                          </option>
                        )}
                      </select>
                    </div>

                    {/* Modelo do Clipe */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="select-clip-model"
                        className="text-sm font-medium text-[var(--marfim)]"
                      >
                        Modelo do Clipe (Modo de IA)
                      </Label>
                      <select
                        id="select-clip-model"
                        aria-label="Modelo do Clipe"
                        value={clipModel}
                        onChange={(e) => setClipModelOverride(e.target.value)}
                      >
                        {options.CLIP_MODEL && options.CLIP_MODEL.length > 0 ? (
                          options.CLIP_MODEL.map((opt) => (
                            <option
                              key={opt.id || opt.value}
                              value={opt.value}
                              className="bg-[var(--superficie)] text-[var(--marfim)]"
                            >
                              {opt.label}
                            </option>
                          ))
                        ) : (
                          <>
                            <option
                              value="auto"
                              className="bg-[var(--superficie)] text-[var(--marfim)]"
                            >
                              Padrão
                            </option>
                            <option
                              value="face_focus"
                              className="bg-[var(--superficie)] text-[var(--marfim)]"
                            >
                              Foco no enquadramento
                            </option>
                          </>
                        )}
                      </select>
                    </div>

                    {/* Proporção */}
                    <div className="space-y-2">
                      <Label
                        htmlFor="select-aspect-ratio"
                        className="text-sm font-medium text-[var(--marfim)]"
                      >
                        Proporção (Aspect Ratio)
                      </Label>
                      <select
                        id="select-aspect-ratio"
                        aria-label="Proporção"
                        value={aspectRatio}
                        onChange={(e) => setAspectRatioOverride(e.target.value)}
                      >
                        {options.ASPECT_RATIO &&
                        options.ASPECT_RATIO.length > 0 ? (
                          options.ASPECT_RATIO.map((opt) => (
                            <option
                              key={opt.id || opt.value}
                              value={opt.value}
                              className="bg-[var(--superficie)] text-[var(--marfim)]"
                            >
                              {opt.label}
                            </option>
                          ))
                        ) : (
                          <option
                            value="9:16"
                            className="bg-[var(--superficie)] text-[var(--marfim)]"
                          >
                            9:16 (Vertical)
                          </option>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Auto Zoom */}
                  <div className="flex items-center justify-between border-t border-[var(--linha)] pt-3">
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="switch-auto-zoom"
                        className="text-sm font-medium text-[var(--marfim)]"
                      >
                        Auto Zoom
                      </Label>
                      <p className="text-xs text-[var(--fumaca)]">
                        Enquadramento automático com zoom dinâmico na pessoa que
                        está falando
                      </p>
                    </div>
                    <Switch
                      id="switch-auto-zoom"
                      aria-label="Auto Zoom"
                      checked={autoZoom}
                      onCheckedChange={setAutoZoom}
                    />
                  </div>
                </div>
              </div>

              {/* Estilo da Legenda */}
              <div className="space-y-4 rounded-xl border border-[var(--linha)] bg-[var(--superficie)] p-6">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--marfim)]">
                    Estilo da Legenda
                  </h2>
                  <p className="mt-1 text-sm text-[var(--fumaca)]">
                    Escolha a aparência visual do texto gerado
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-h-[300px] overflow-y-auto pr-2 pb-2 scrollbar-thin scrollbar-thumb-[var(--linha-2)]">
                  {[
                    { id: "HORMOZI", name: "Viral Bold", desc: "Amarelo em destaque, 1-2 palavras", color: "text-yellow-400 font-bold uppercase italic" },
                    { id: "POPPING_GREEN", name: "MrBeast", desc: "Verde brilhante gigante e rápido", color: "text-green-400 font-bold uppercase" },
                    { id: "GAMER", name: "Gamer Action", desc: "Vermelho e branco itálico", color: "text-red-500 font-bold italic uppercase" },
                    { id: "LOUD", name: "Impacto Máximo", desc: "Branco gigante, 1 palavra", color: "text-white font-black uppercase text-xl" },
                    { id: "NEON", name: "Cyberpunk", desc: "Ciano com brilho neon", color: "text-cyan-400 font-bold uppercase" },
                    { id: "TRUE_CRIME", name: "Investigação", desc: "Vermelho escuro, sombrio", color: "text-red-700 font-mono font-bold" },
                    { id: "MINIMAL", name: "Cinematic", desc: "Branco limpo, 5 palavras", color: "text-white font-sans font-light" },
                    { id: "CORPORATE", name: "Corporativo", desc: "Fundo branco, texto azul", color: "text-blue-900 bg-white/90 px-2 rounded font-sans font-semibold" },
                    { id: "VLOG", name: "Caixa Opaca", desc: "Fundo preto, texto branco", color: "text-white bg-black px-2 rounded font-sans font-semibold" },
                    { id: "ASMR", name: "Delicado", desc: "Rosa pastel, fino e pequeno", color: "text-pink-300 font-serif italic text-sm" },
                    { id: "NONE", name: "Sem Legenda", desc: "Apenas o vídeo original", color: "text-[var(--marfim)]" },
                  ].map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setPreset(p.id)}
                      className={`cursor-pointer rounded-xl border p-4 transition-all flex flex-col items-center justify-center min-h-[100px] ${preset === p.id ? "border-[var(--ouro)] bg-[var(--superficie-2)] shadow-[0_0_15px_rgba(232,186,82,0.1)] scale-[1.02]" : "border-[var(--linha)] bg-[var(--superficie)] hover:border-[var(--linha-2)]"}`}
                    >
                      <p className={`text-center drop-shadow-md ${p.color}`}>
                        {p.name}
                      </p>
                      <p className="mt-2 text-center text-[10px] sm:text-xs text-[var(--fumaca)] leading-tight">
                        {p.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setMetadata(null)}
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
                  Confirmar e Processar
                </Button>
              </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
