"use client";

import { useState } from "react";
import Dropzone, { type DropzoneState } from "shadcn-dropzone";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Film, Loader2, UploadCloud, Youtube } from "lucide-react";
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

export type SubtitlePreset = "HORMOZI" | "MINIMAL" | "NEON";

export interface ImportVideoTabsProps {
  userCredits: number;
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
    description: "Palavras em destaque animadas com alto contraste e dinamismo.",
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
  onUploadSuccess,
}: ImportVideoTabsProps) {
  // Tab State
  const [activeTab, setActiveTab] = useState<string>("upload");

  // Subtitle Preset State (shared across tabs)
  const [selectedPreset, setSelectedPreset] = useState<SubtitlePreset>("HORMOZI");

  // Upload MP4 State
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  // YouTube Link State
  const [youtubeUrl, setYoutubeUrl] = useState<string>("");
  const [importing, setImporting] = useState<boolean>(false);

  // Credit calculation for local upload
  const creditsCost = durationSeconds ? calculateVideoCredits(durationSeconds) : 1;
  const isUploadInsufficientCredits = file !== null && userCredits < creditsCost;

  // Validation for YouTube
  const trimmedYouTubeUrl = youtubeUrl.trim();
  const isYouTubeValid = isValidYouTubeUrl(trimmedYouTubeUrl);
  const isYouTubeInsufficientCredits = userCredits < 1;

  // Read video duration on file drop
  const handleDrop = (acceptedFiles: File[]) => {
    if (!acceptedFiles || acceptedFiles.length === 0) return;
    const selectedFile = acceptedFiles[0];
    if (!selectedFile) return;

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

      await processVideo(uploadedFileId, selectedPreset);

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
      const result = await importYouTubeVideo({
        url: trimmedYouTubeUrl,
        preset: selectedPreset,
      });

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
    <Card className="w-full rounded-2xl border border-[var(--linha)] bg-[#161310] shadow-[0_0_30px_rgba(0,0,0,0.5)]">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-[var(--marfim)]">Importar Vídeo para Cortes</CardTitle>
        <CardDescription className="text-xs text-[var(--fumaca)]">
          Envie um arquivo de vídeo do seu dispositivo ou importe diretamente pelo link do YouTube.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-6"
        >
          <TabsList className="grid w-full grid-cols-2 bg-[#0b0a08] border border-[var(--linha)] rounded-full p-1 h-auto">
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
              maxSize={500 * 1024 * 1024}
              disabled={uploading}
              maxFiles={1}
            >
              {(_dropzone: DropzoneState) => (
                <div className="flex flex-col items-center justify-center space-y-4 rounded-2xl border-2 border-dashed border-[var(--linha-2)] bg-[#0b0a08]/80 hover:border-[var(--ouro)]/50 transition-colors p-8 text-center cursor-pointer">
                  <UploadCloud className="text-[var(--ouro)] h-12 w-12" />
                  <div>
                    <p className="font-medium text-[var(--marfim)]">Arraste e solte seu arquivo de vídeo</p>
                    <p className="text-sm text-[var(--fumaca)]">
                      ou clique para selecionar (MP4 ou MOV até 500MB)
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
              <div className="rounded-xl border border-[var(--linha)] bg-[#1d1914] p-4 space-y-3">
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
                    <Badge variant="outline" className="text-xs rounded-full border-[var(--linha-2)] bg-[#161310] text-[var(--patina)] font-mono">
                      Custo: {creditsCost} crédito{creditsCost > 1 ? "s" : ""}
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

                {/* Insufficient credits alert */}
                {isUploadInsufficientCredits && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-xl border border-[var(--perigo)]/40 bg-[var(--perigo)]/10 p-3 text-[var(--perigo)] text-sm font-medium"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>
                      Saldo insuficiente: você possui {userCredits} crédito{userCredits !== 1 ? "s" : ""}, mas este vídeo requer {creditsCost} crédito{creditsCost !== 1 ? "s" : ""}.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Subtitle Preset Selector */}
            {renderPresetSelector()}

            {/* Submit Button */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                onClick={handleUploadSubmit}
                disabled={!file || uploading || isUploadInsufficientCredits}
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
                className="bg-[#0b0a08] border border-[var(--linha)] text-[var(--marfim)] placeholder:text-[var(--fumaca)] focus:border-[var(--ouro)] rounded-xl"
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

            {/* YouTube Insufficient Credits Alert */}
            {isYouTubeInsufficientCredits && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-[var(--perigo)]/40 bg-[var(--perigo)]/10 p-3 text-[var(--perigo)] text-sm font-medium"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>
                  Saldo insuficiente: você possui 0 créditos. Recarregue seus créditos para importar vídeos.
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
                disabled={!isYouTubeValid || importing || isYouTubeInsufficientCredits}
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
