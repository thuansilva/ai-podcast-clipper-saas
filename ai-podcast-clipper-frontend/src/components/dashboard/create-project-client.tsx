"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import {   } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Switch } from "~/components/ui/switch";
import {
  Loader2,
  ScissorsIcon,
  UploadCloudIcon,
  SlidersHorizontalIcon,
  
  YoutubeIcon,
} from "lucide-react";
import { toast } from "sonner";
import { importYouTubeVideo } from "~/actions/youtube";
import { Slider } from "~/components/ui/slider";
import type { ProcessingOption } from "~/application/services/processing-options.service";

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
}: CreateProjectClientProps) {
  const [url, setUrl] = useState(initialUrl);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(initialMetadata);
  const [loadingMeta, setLoadingMeta] = useState(false);

  const [range, setRange] = useState<[number, number]>(() => {
    if (initialMetadata?.durationSeconds) {
      const defaultDuration = Math.min(5 * 60, initialMetadata.durationSeconds);
      return [0, Math.floor(defaultDuration / 60)];
    }
    return [0, 5];
  });
  const [preset, setPreset] = useState("HORMOZI");
  const [genre, setGenre] = useState(() =>
    getDefaultOptionValue(options.GENRE),
  );
  const [clipModel, setClipModel] = useState(() =>
    getDefaultOptionValue(options.CLIP_MODEL),
  );
  const [aspectRatio, setAspectRatio] = useState(() =>
    getDefaultOptionValue(options.ASPECT_RATIO),
  );
  const [autoZoom, setAutoZoom] = useState(true);

  const [processing, setProcessing] = useState(false);

  const router = useRouter();

  useEffect(() => {
    if (options.GENRE?.length && !genre) {
      setGenre(getDefaultOptionValue(options.GENRE));
    }
    if (options.CLIP_MODEL?.length && !clipModel) {
      setClipModel(getDefaultOptionValue(options.CLIP_MODEL));
    }
    if (options.ASPECT_RATIO?.length && !aspectRatio) {
      setAspectRatio(getDefaultOptionValue(options.ASPECT_RATIO));
    }
  }, [options, genre, clipModel, aspectRatio]);

  const handleFetchMeta = async (targetUrl: string) => {
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
      const defaultDuration = Math.min(5 * 60, data.durationSeconds || 300);
      setRange([0, Math.floor(defaultDuration / 60)]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoadingMeta(false);
    }
  };

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
  }, [url, metadata, initialUrl]);

  const startMin = range[0] || 0;
  const endMin = range[1] || 5;
  const cost = Math.max(1, endMin - startMin);

  const handleSubmit = async () => {
    if (!url || !metadata) return;

    if (cost > userCredits) {
      toast.error(
        `Você precisa de ${cost} créditos, mas tem apenas ${userCredits}.`,
      );
      return;
    }

    setProcessing(true);
    try {
      const result = await importYouTubeVideo({
        url,
        preset,
        sliceStartTime: startMin * 60,
        sliceEndTime: endMin * 60,
        mode: "auto",
        genre: genre || undefined,
        clipModel: clipModel || undefined,
        aspectRatio: aspectRatio || undefined,
        autoZoom,
      });

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

                <div className="mt-6 flex items-center justify-center relative z-10">
                  <button 
                    type="button"
                    onClick={() => toast.info("Upload de arquivo local estará disponível em breve!")}
                    className="flex items-center gap-2 text-sm text-[var(--fumaca)] hover:text-[var(--marfim)] transition-colors cursor-pointer group/btn"
                  >
                    <UploadCloudIcon className="h-4 w-4 group-hover/btn:-translate-y-0.5 transition-transform" />
                    <span className="font-medium underline underline-offset-4 decoration-[var(--linha-2)] group-hover/btn:decoration-[var(--marfim)]/50">
                      Enviar
                    </span>
                  </button>
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
              Ajuste os parâmetros de corte e deixe a IA fazer o resto.
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
                    {Math.floor(metadata.durationSeconds / 60)} minutos totais
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6 md:col-span-8">
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
                      value={range}
                      min={0}
                      max={Math.floor(metadata.durationSeconds / 60)}
                      step={1}
                      onValueChange={(val) => {
                        const v0 = val[0] || 0;
                        const v1 = val[1] || v0 + 1;
                        const maxMinutes = Math.floor(
                          metadata.durationSeconds / 60,
                        );
                        if (v1 > v0) {
                          setRange([v0, v1]);
                        } else if (v1 === v0) {
                          if (v1 < maxMinutes) {
                            setRange([v0, v1 + 1]);
                          } else {
                            setRange([Math.max(0, v0 - 1), v1]);
                          }
                        }
                      }}
                    />
                    <div className="mt-4 flex justify-between text-xs font-medium text-[var(--fumaca)]">
                      <span>{startMin} min</span>
                      <span>{endMin} min</span>
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
                    <div className="font-mono text-2xl font-bold text-[var(--ouro)]">
                      {cost}{" "}
                      <span className="text-sm font-normal">Créditos</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Opções de Processamento Dinâmicas */}
              <div className="space-y-6 rounded-xl border border-[var(--linha)] bg-[var(--superficie)] p-6">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--marfim)]">
                    <SlidersHorizontalIcon className="h-5 w-5 text-[var(--ouro)]" />
                    Configurações do Corte
                  </h2>
                  <p className="mt-1 text-sm text-[var(--fumaca)]">
                    Personalize o formato, foco e estilo dos seus cortes
                    gerados por IA
                  </p>
                </div>
                <div className="space-y-6">
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
                        onChange={(e) => setGenre(e.target.value)}
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
                        onChange={(e) => setClipModel(e.target.value)}
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
                        onChange={(e) => setAspectRatio(e.target.value)}
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div
                    onClick={() => setPreset("HORMOZI")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${preset === "HORMOZI" ? "border-[var(--ouro)] bg-[var(--superficie-2)] shadow-[0_0_15px_rgba(232,186,82,0.1)]" : "border-[var(--linha)] bg-[var(--superficie)] hover:border-[var(--linha-2)]"}`}
                  >
                    <p className="text-center text-lg font-bold text-yellow-400 uppercase italic drop-shadow-md">
                      Viral Bold
                    </p>
                    <p className="mt-2 text-center text-xs text-[var(--fumaca)]">
                      Cores chamativas e emojis
                    </p>
                  </div>
                  <div
                    onClick={() => setPreset("CLEAN")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${preset === "CLEAN" ? "border-[var(--ouro)] bg-[var(--superficie-2)] shadow-[0_0_15px_rgba(232,186,82,0.1)]" : "border-[var(--linha)] bg-[var(--superficie)] hover:border-[var(--linha-2)]"}`}
                  >
                    <p className="text-center font-sans text-lg font-semibold tracking-wide text-white">
                      Clean Corp
                    </p>
                    <p className="mt-2 text-center text-xs text-[var(--fumaca)]">
                      Minimalista e elegante
                    </p>
                  </div>
                  <div
                    onClick={() => setPreset("NONE")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${preset === "NONE" ? "border-[var(--ouro)] bg-[var(--superficie-2)] shadow-[0_0_15px_rgba(232,186,82,0.1)]" : "border-[var(--linha)] bg-[var(--superficie)] hover:border-[var(--linha-2)]"}`}
                  >
                    <p className="text-center font-sans text-lg font-semibold tracking-wide text-[var(--marfim)]">
                      Sem Legenda
                    </p>
                    <p className="mt-2 text-center text-xs text-[var(--fumaca)]">
                      Apenas áudio e vídeo original
                    </p>
                  </div>
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
                  disabled={processing || cost > userCredits}
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
