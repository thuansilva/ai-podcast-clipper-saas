"use client";

import { useState, useEffect, useRef } from "react";
import Dropzone, { type DropzoneState } from "shadcn-dropzone";
import type { FileRejection } from "react-dropzone";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Film, Loader2, UploadCloud, Youtube, Plus, Trash2, Clock } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { calculateVideoCredits } from "~/lib/credits";
import { extractYouTubeVideoId, isValidYouTubeUrl } from "~/lib/youtube";
import { generateUploadUrl } from "~/actions/s3";
import { processVideo } from "~/actions/generation";
import { importYouTubeVideo } from "~/actions/youtube";
import {
  parseTimestampToSeconds,
  formatSecondsToTimestamp,
  addSecondsToTimestamp,
  validateManualCut,
} from "~/domain/rules/timestamp-parser";
import { calculateManualCutsCredits } from "~/domain/rules/calculate-credits";
import {
  validateVideoDuration,
  validateFileSize,
  MAX_FILE_SIZE_BYTES,
} from "~/domain/rules/video-limits";
import type { ManualCutDTO, ProcessingMode } from "~/application/dtos/video-dtos";

export type SubtitlePreset = "HORMOZI" | "MINIMAL" | "NEON";

export interface ImportVideoTabsProps {
  userCredits: number;
  userPlan?: string;
  onUploadSuccess?: () => void;
}

const SUBTITLE_PRESETS: {
  id: SubtitlePreset;
  name: string;
  badge: string;
  description: string;
}[] = [
    {
      id: "HORMOZI",
      name: "HORMOZI",
      badge: "🔥 Viral",
      description: "Palavras em destaque com dinamismo.",
    },
    {
      id: "MINIMAL",
      name: "MINIMAL",
      badge: "✨ Clean",
      description: "Estilo minimalista e discreto, focado em leitura clara.",
    },
    {
      id: "NEON",
      name: "NEON",
      badge: "⚡ Vibrante",
      description: "Cores neon brilhantes para visual moderno e chamativo.",
    },
  ];

export function ImportVideoTabs({
  userCredits,
  userPlan = "STARTER",
  onUploadSuccess,
}: ImportVideoTabsProps) {

  // Tab State
  const [activeTab, setActiveTab] = useState<string>("upload");

  // Mode State
  const [mode, setMode] = useState<ProcessingMode>("auto");

  // Cut ID counter
  const cutIdCounter = useRef(2);

  // Video preview ref and url
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Manual Cuts State
  const [manualCuts, setManualCuts] = useState<{ id: string; title: string; start: string; end: string }[]>([
    { id: "cut-1", title: "", start: "00:00", end: "00:30" },
  ]);
  // Subtitle Preset State (shared across tabs)
  const [selectedPreset, setSelectedPreset] = useState<SubtitlePreset>("HORMOZI");

  // Upload MP4 State
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
      return () => {
        URL.revokeObjectURL(url);
        setFilePreviewUrl(null);
      };
    }
  }, [file]);

  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  // YouTube Link State
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [importing, setImporting] = useState<boolean>(false);

  const parsedManualCuts: ManualCutDTO[] = manualCuts.map((c) => ({
    title: c.title,
    startTime: parseTimestampToSeconds(c.start) ?? 0,
    endTime: parseTimestampToSeconds(c.end) ?? 0,
  }));
  const manualCreditsCost = calculateManualCutsCredits(parsedManualCuts);

  const uploadCreditsCost = mode === "auto" ? (durationSeconds ? calculateVideoCredits(durationSeconds) : 1) : manualCreditsCost;
  const isUploadInsufficientCredits = file !== null && userCredits < uploadCreditsCost;

  const trimmedYouTubeUrl = youtubeUrl.trim();
  const isYouTubeValid = isValidYouTubeUrl(trimmedYouTubeUrl);

  const youtubeCreditsCost = mode === "auto" ? 1 : manualCreditsCost;
  const isYouTubeInsufficientCredits = userCredits < youtubeCreditsCost;

  const currentMaxDuration = activeTab === "upload" ? (durationSeconds ?? undefined) : undefined;

  const hasManualCutsError = mode === "manual" && manualCuts.some(c => {
    const start = parseTimestampToSeconds(c.start) ?? NaN;
    const end = parseTimestampToSeconds(c.end) ?? NaN;
    const { valid } = validateManualCut(start, end, currentMaxDuration);
    return !valid;
  });

  // Read video duration on file drop
  const handleDrop = (
    acceptedFiles: File[],
    fileRejections?: FileRejection[]
  ) => {
    if (fileRejections && fileRejections.length > 0) {
      const isSizeError = fileRejections.some((r) =>
        r.errors.some((e) => e.code === "file-too-large")
      );
      if (isSizeError) {
        toast.error("O arquivo selecionado é muito grande. O limite máximo permitido é de 2 GB por arquivo.");
        return;
      }
      toast.error("Arquivo rejeitado. Verifique o formato e o tamanho.");
      return;
    }

    if (!acceptedFiles || acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

    const sizeValidation = validateFileSize(selectedFile.size);
    if (!sizeValidation.valid) {
      toast.error(sizeValidation.error ?? "Arquivo muito grande.");
      return;
    }

    setFile(selectedFile);

    if (
      typeof window !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function"
    ) {
      try {
        const video = document.createElement("video");
        video.preload = "metadata";
        const objectUrl = URL.createObjectURL(selectedFile);
        video.src = objectUrl;

        video.onloadedmetadata = () => {
          if (typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(objectUrl);
          }
          const dur = Math.round(video.duration);
          const durationValidation = validateVideoDuration(dur, userPlan);
          if (!durationValidation.valid) {
            toast.error(durationValidation.error ?? "Duração excede o limite permitido.");
            setFile(null);
            setDurationSeconds(null);
            return;
          }
          setDurationSeconds(dur > 0 ? dur : null);
        };

        video.onerror = () => {
          if (typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(objectUrl);
          }
          setDurationSeconds(null);
        };
      } catch {
        setDurationSeconds(null);
      }
    } else {
      setDurationSeconds(null);
    }
  };

  const handleUploadSubmit = async () => {
    if (!file || isUploadInsufficientCredits) return;

    if (durationSeconds) {
      const durationValidation = validateVideoDuration(durationSeconds, userPlan);
      if (!durationValidation.valid) {
        toast.error(durationValidation.error ?? "Duração excede o limite permitido.");
        return;
      }
    }

    setUploading(true);

    try {
      const { success, signedUrl, uploadedFileId } = await generateUploadUrl({
        filename: file.name,
        contentType: file.type || "video/mp4",
      });

      if (!success) {
        throw new Error("Não foi possível gerar a URL para upload.");
      }

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "video/mp4",
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Falha no upload com status: ${uploadResponse.status}`);
      }

      if (mode === "manual") {
        await processVideo(uploadedFileId, selectedPreset, mode, parsedManualCuts);
      } else {
        await processVideo(uploadedFileId, selectedPreset);
      }

      setFile(null);
      setDurationSeconds(null);

      toast.success("Vídeo enviado com sucesso!", {
        description: "Seu vídeo foi adicionado à fila para geração de cortes.",
      });

      onUploadSuccess?.();
    } catch (error) {
      toast.error("Falha no upload", {
        description:
          error instanceof Error
            ? error.message
            : "Ocorreu um erro ao enviar o arquivo. Tente novamente.",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleYouTubeSubmit = async () => {
    if (!isYouTubeValid || isYouTubeInsufficientCredits) return;
    setImporting(true);

    try {
      const result = await importYouTubeVideo(
        mode === "manual" ? {
          url: trimmedYouTubeUrl,
          preset: selectedPreset,
          mode: "manual",
          manualCuts: parsedManualCuts,
        } : {
          url: trimmedYouTubeUrl,
          preset: selectedPreset,
        }
      );

      if (result.success) {
        toast.success("Vídeo do YouTube importado!", {
          description:
            "O vídeo foi enfileirado para download e processamento de cortes.",
        });
        setYoutubeUrl("");
        onUploadSuccess?.();
      } else {
        toast.error("Erro ao importar do YouTube", {
          description: result.error ?? "Não foi possível importar o vídeo.",
        });
      }
    } catch (error) {
      toast.error("Erro na importação", {
        description:
          error instanceof Error
            ? error.message
            : "Falha na comunicação com o servidor.",
      });
    } finally {
      setImporting(false);
    }
  };
  const renderModeSelector = () => (
    <div className="flex bg-[var(--superficie-2)] p-1 rounded-xl border border-[var(--linha)] w-full">
      <Button
        type="button"
        variant={mode === "auto" ? "default" : "ghost"}
        onClick={() => setMode("auto")}
        className={`flex-1 rounded-lg text-xs font-medium cursor-pointer ${mode === "auto" ? "btn-ouro text-[var(--tinta)]" : "text-[var(--fumaca)] hover:text-[var(--marfim)] hover:bg-[var(--linha)]/50"}`}
      >
        Auto IA (Recomendado)
      </Button>
      <Button
        type="button"
        variant={mode === "manual" ? "default" : "ghost"}
        onClick={() => setMode("manual")}
        className={`flex-1 rounded-lg text-xs font-medium cursor-pointer ${mode === "manual" ? "btn-ouro text-[var(--tinta)]" : "text-[var(--fumaca)] hover:text-[var(--marfim)] hover:bg-[var(--linha)]/50"}`}
      >
        Corte Manual Preciso
      </Button>
    </div>
  );

  const handleUpdateCut = (id: string, field: keyof typeof manualCuts[0], value: string) => {
    setManualCuts(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const addManualCut = () => {
    setManualCuts(prev => [
      ...prev,
      { id: `cut-${cutIdCounter.current++}`, title: "", start: "00:00", end: "00:30" }
    ]);
  };

  const removeManualCut = (id: string) => {
    setManualCuts(prev => prev.filter(c => c.id !== id));
  };

  const renderManualCuts = (isVideoLoaded: boolean) => {
    if (mode !== "manual") return null;
    return (
      <div className="space-y-3">
        {manualCuts.map((cut, index) => {
          const startSecs = parseTimestampToSeconds(cut.start) ?? NaN;
          const endSecs = parseTimestampToSeconds(cut.end) ?? NaN;
          const { valid, error } = validateManualCut(startSecs, endSecs, currentMaxDuration);

          return (
            <Card key={cut.id} className="bg-[var(--tinta)] border-[var(--linha)] rounded-xl overflow-hidden">
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] bg-[var(--superficie)] text-[var(--patina)] border-[var(--linha)]">
                    Corte {index + 1}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeManualCut(cut.id)}
                    disabled={manualCuts.length <= 1}
                    className="h-6 w-6 text-[var(--fumaca)] hover:text-[var(--perigo)] hover:bg-[var(--perigo)]/10"
                    aria-label="Remover corte"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-1">
                  <Input
                    placeholder="Título opcional (ex: Gancho)"
                    value={cut.title}
                    onChange={(e) => handleUpdateCut(cut.id, "title", e.target.value)}
                    className="h-8 text-xs bg-[var(--superficie)] border-[var(--linha)] text-[var(--marfim)]"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-[var(--fumaca)]">Início</Label>
                    <Input
                      placeholder="00:00"
                      value={cut.start}
                      onChange={(e) => handleUpdateCut(cut.id, "start", e.target.value)}
                      className="h-8 text-xs font-mono bg-[var(--superficie)] border-[var(--linha)] text-[var(--marfim)]"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-[var(--fumaca)]">Fim</Label>
                    <Input
                      placeholder="00:30"
                      value={cut.end}
                      onChange={(e) => handleUpdateCut(cut.id, "end", e.target.value)}
                      className="h-8 text-xs font-mono bg-[var(--superficie)] border-[var(--linha)] text-[var(--marfim)]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[var(--fumaca)] mr-1">Rápido:</span>
                  {[25, 30, 60].map(delta => (
                    <Button
                      key={delta}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUpdateCut(cut.id, "end", addSecondsToTimestamp(cut.start, delta))}
                      className="h-6 px-2 text-[10px] bg-[var(--superficie)] border-[var(--linha)] text-[var(--marfim)] hover:border-[var(--ouro)] hover:text-[var(--ouro)] transition-colors"
                    >
                      +{delta}s
                    </Button>
                  ))}
                  {isVideoLoaded && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (previewVideoRef.current) {
                          handleUpdateCut(cut.id, "start", formatSecondsToTimestamp(previewVideoRef.current.currentTime));
                        }
                      }}
                      className="h-6 px-2 text-[10px] bg-[var(--superficie)] border-[var(--linha)] text-[var(--marfim)] hover:border-[var(--ouro)] hover:text-[var(--ouro)] transition-colors ml-auto"
                    >
                      <Clock className="h-3 w-3 mr-1" /> Marcar tempo atual
                    </Button>
                  )}
                </div>

                {!valid && error && (
                  <div className="flex items-center gap-1.5 text-[var(--perigo)] text-[10px] font-medium mt-1">
                    <AlertCircle className="h-3 w-3" />
                    <span>{error}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addManualCut}
          className="w-full h-8 text-xs border-dashed border-[var(--linha)] bg-[var(--superficie)] text-[var(--fumaca)] hover:text-[var(--marfim)] hover:border-[var(--ouro)]/50"
        >
          <Plus className="h-3 w-3 mr-1" /> Adicionar outro corte
        </Button>
      </div>
    );
  };

  const renderPresetSelector = () => (

    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Preset de Legendas</Label>
        <Badge variant="outline" className="text-xs">
          {selectedPreset} selecionado
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {SUBTITLE_PRESETS.map((p) => {
          const isSelected = selectedPreset === p.id;
          return (
            <Button
              key={p.id}
              type="button"
              variant={isSelected ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedPreset(p.id)}
              className="flex h-auto flex-col items-start gap-1 p-2 text-left"
              data-testid={`preset-button-${p.id.toLowerCase()}`}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-semibold text-xs">{p.name}</span>
                <span className="text-[10px] opacity-80">{p.badge}</span>
              </div>
              <p className="line-clamp-2 text-[11px] font-normal opacity-70">
                {p.description}
              </p>
            </Button>
          );
        })}
      </div>
    </div>
  );

  return (
    <Card className="w-full rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-semibold text-[var(--marfim)]">Importar Vídeo para Cortes</CardTitle>
            <CardDescription className="text-xs text-[var(--fumaca)]">
              Envie um arquivo de vídeo do seu dispositivo ou importe diretamente pelo link do YouTube.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="w-fit self-start sm:self-auto rounded-full border-[var(--linha-2)] bg-[var(--tinta)] text-[var(--ouro)] text-[11px] font-mono px-3 py-1"
            data-testid="plan-limit-badge"
          >
            {userPlan.toUpperCase() === "STUDIO"
              ? "Plano Studio: Máx. 3h por vídeo"
              : "Plano Starter: Máx. 2h por vídeo"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-6"
        >
          <TabsList className="grid w-full grid-cols-2 bg-[var(--tinta)] border border-[var(--linha)] rounded-full p-1 h-auto">
            <TabsTrigger
              value="upload"
              className="flex items-center justify-center gap-2 rounded-full py-2 text-xs font-medium text-[var(--marfim-2)] data-[state=active]:bg-[var(--ouro)] data-[state=active]:text-[var(--tinta)] data-[state=active]:font-semibold transition-all cursor-pointer"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload de Arquivo</span>
            </TabsTrigger>
            <TabsTrigger
              value="youtube"
              className="flex items-center justify-center gap-2 rounded-full py-2 text-xs font-medium text-[var(--marfim-2)] data-[state=active]:bg-[var(--ouro)] data-[state=active]:text-[var(--tinta)] data-[state=active]:font-semibold transition-all cursor-pointer"
            >
              <Youtube className="h-4 w-4" />
              <span>Link do YouTube</span>
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: UPLOAD DE ARQUIVO */}
          <TabsContent value="upload" className="space-y-5">
            <Dropzone
              onDrop={handleDrop}
              accept={{
                "video/mp4": [".mp4"],
                "video/quicktime": [".mov"],
              }}
              maxSize={MAX_FILE_SIZE_BYTES}
              disabled={uploading}
              maxFiles={1}
            >
              {(_dropzone: DropzoneState) => (
                <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-dashed border-[var(--linha-2)] bg-[var(--tinta)]/80 hover:border-[var(--ouro)]/50 transition-colors p-8 text-center cursor-pointer">
                  <UploadCloud className="text-[var(--ouro)] h-12 w-12" />
                  <div>
                    <p className="font-medium text-[var(--marfim)]">Arraste e solte seu arquivo de vídeo</p>
                    <p className="text-sm text-[var(--fumaca)]">
                      ou clique para selecionar (MP4 ou MOV até 2 GB)
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={uploading}
                    className="btn-ouro !text-xs !py-1.5 !px-4 cursor-pointer"
                  >
                    Selecionar Arquivo
                  </Button>
                </div>
              )}
            </Dropzone>

            {/* Selected File Details */}
            {file && (
              <div className="rounded-xl border border-[var(--linha)] bg-[var(--superficie-2)] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Film className="h-5 w-5 text-[var(--ouro)] shrink-0" />
                    <div>
                      <p className="font-medium text-sm text-[var(--marfim)] truncate max-w-sm">
                        {file.name}
                      </p>
                      <p className="text-xs text-[var(--fumaca)] font-mono">
                        {(file.size / (1024 * 1024)).toFixed(1)} MB
                        {durationSeconds !== null && (
                          <> • {Math.floor(durationSeconds / 60)}m {durationSeconds % 60}s</>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs rounded-full border-[var(--linha-2)] bg-[var(--superficie)] text-[var(--patina)] font-mono">
                      Custo: {uploadCreditsCost} crédito{uploadCreditsCost > 1 ? "s" : ""}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setFile(null);
                        setDurationSeconds(null);
                      }}
                      disabled={uploading}
                      className="text-xs text-[var(--fumaca)] hover:text-[var(--perigo)] cursor-pointer"
                    >
                      Remover
                    </Button>
                  </div>
                </div>

                {filePreviewUrl && (
                  <div className="mt-3 rounded-xl border border-[var(--linha)] overflow-hidden bg-black/40">
                    <video
                      ref={previewVideoRef}
                      src={filePreviewUrl}
                      controls
                      playsInline
                      className="w-full max-h-52 object-contain"
                    />
                  </div>
                )}

                {/* Insufficient credits alert */}
                {isUploadInsufficientCredits && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-[var(--perigo)]/40 bg-[var(--perigo)]/10 p-3 text-[var(--perigo)] text-sm font-medium"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Saldo insuficiente: você possui {userCredits} crédito{userCredits !== 1 ? "s" : ""}, mas {mode === "manual" ? "os cortes manuais requerem" : "este vídeo requer"} {uploadCreditsCost} crédito{uploadCreditsCost !== 1 ? "s" : ""}.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Mode Selector */}
            {renderModeSelector()}
            {renderManualCuts(!!file)}

            {/* Subtitle Preset Selector */}


            {renderPresetSelector()}

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleUploadSubmit}
                disabled={!file || uploading || isUploadInsufficientCredits || hasManualCutsError}
                className="btn-ouro !w-full sm:!w-auto !py-2.5 !px-6 !text-xs cursor-pointer"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando e Gerando Cortes...
                  </>
                ) : (
                  "Enviar e Gerar Cortes"
                )}
              </Button>
            </div>
          </TabsContent>

          {/* ABA 2: LINK DO YOUTUBE */}
          <TabsContent value="youtube" className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="youtube-url-input" className="text-sm font-medium text-[var(--marfim)]">
                Link do Vídeo do YouTube
              </Label>
              <Input
                id="youtube-url-input"
                type="url"
                placeholder="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                disabled={importing}
                aria-label="Link do YouTube"
                className="bg-[var(--tinta)] border border-[var(--linha)] text-[var(--marfim)] placeholder:text-[var(--fumaca)] focus:border-[var(--ouro)] rounded-xl"
              />

              {/* Dynamic validation feedback */}
              {trimmedYouTubeUrl.length > 0 && (
                <div className="pt-1">
                  {isYouTubeValid ? (
                    <div className="flex items-center gap-1.5 text-[var(--patina)] text-xs font-medium font-mono">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>
                        URL válida do YouTube (Vídeo ID: {extractYouTubeVideoId(trimmedYouTubeUrl)})
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[var(--perigo)] text-xs font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>
                        Insira uma URL válida do YouTube (ex: https://www.youtube.com/watch?v=...)
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mode Selector */}
            {renderModeSelector()}
            {renderManualCuts(false)}

            {/* YouTube Insufficient Credits Alert */}
            {isYouTubeInsufficientCredits && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-[var(--perigo)]/40 bg-[var(--perigo)]/10 p-3 text-[var(--perigo)] text-sm font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Saldo insuficiente: você possui {userCredits} crédito{userCredits !== 1 ? "s" : ""}, mas {mode === "manual" ? "os cortes manuais requerem" : "a importação requer"} {youtubeCreditsCost} crédito{youtubeCreditsCost !== 1 ? "s" : ""}.
                </span>
              </div>
            )}

            {/* Subtitle Preset Selector */}
            {renderPresetSelector()}

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleYouTubeSubmit}
                disabled={!isYouTubeValid || importing || isYouTubeInsufficientCredits || hasManualCutsError}
                className="btn-ouro !w-full sm:!w-auto !py-2.5 !px-6 !text-xs cursor-pointer"
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importando do YouTube...
                  </>
                ) : (
                  "Importar do YouTube"
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
