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

  const [range, setRange] = useState<[number, number]>(() => {
    if (initialSettings?.sliceStartTime !== undefined && initialSettings?.sliceEndTime !== undefined) {
      return [
        Math.floor(initialSettings.sliceStartTime / 60),
        Math.floor(initialSettings.sliceEndTime / 60)
      ];
    }
    if (initialMetadata?.durationSeconds) {
      const defaultDuration = Math.min(5 * 60, initialMetadata.durationSeconds);
      return [0, Math.floor(defaultDuration / 60)];
    }
    return [0, 5];
  });
  const [preset, setPreset] = useState(initialSettings?.preset || "HORMOZI");
  const [genre, setGenre] = useState(() =>
    initialSettings?.genre || getDefaultOptionValue(options.GENRE),
  );
  const [clipModel, setClipModel] = useState(() =>
    initialSettings?.clipModel || getDefaultOptionValue(options.CLIP_MODEL),
  );
  const [aspectRatio, setAspectRatio] = useState(() =>
    initialSettings?.aspectRatio || getDefaultOptionValue(options.ASPECT_RATIO),
  );
  const [autoZoom, setAutoZoom] = useState(initialSettings?.autoZoom ?? true);

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

    setProcessing(true);
    try {
      if (editMode && editProjectId) {
        const { retryProjectAction } = await import("~/actions/projects-actions");
        const res = await retryProjectAction(editProjectId, {
          subtitlePreset: preset,
          clipModel,
          aspectRatio,
          autoZoom,
          sliceStartTime: startMin * 60,
          sliceEndTime: endMin * 60,
        });

        if (!res.success) {
          throw new Error(res.error || "Erro ao reenviar");
        }
        
        toast.success("Projeto atualizado e reenviado!");
        router.push("/dashboard");
        router.refresh();
        return;
      }

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
        thumbnailUrl: metadata?.thumbnailUrl,
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
