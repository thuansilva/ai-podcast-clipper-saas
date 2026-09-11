"use client";

import type { Clip } from "@prisma/client";
import { useEffect, useState } from "react";
import { Loader2, Sparkles, Subtitles, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { updateClip } from "~/actions/generation";

export type SubtitlePreset = "HORMOZI" | "MINIMAL" | "NEON";

export interface TranscriptWordItem {
  word: string;
  start?: number;
  end?: number;
}

export interface ClipEditorModalProps {
  clip: Clip;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: {
    subtitlePreset: SubtitlePreset;
    transcriptWords: TranscriptWordItem[];
  }) => Promise<void> | void;
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

function parseTranscriptWords(raw: unknown): TranscriptWordItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item, idx) => {
      if (typeof item === "string") {
        return { word: item, start: idx * 0.5, end: (idx + 1) * 0.5 };
      }
      if (typeof item === "object" && item !== null && "word" in item) {
        const w = item as { word: string; start?: number; end?: number };
        return {
          word: String(w.word ?? ""),
          start: typeof w.start === "number" ? w.start : idx * 0.5,
          end: typeof w.end === "number" ? w.end : (idx + 1) * 0.5,
        };
      }
      return { word: String(item), start: idx * 0.5, end: (idx + 1) * 0.5 };
    });
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parseTranscriptWords(parsed);
    } catch {
      // Raw string of words
      return raw
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w, idx) => ({
          word: w,
          start: idx * 0.5,
          end: (idx + 1) * 0.5,
        }));
    }
  }
  return [];
}

export function ClipEditorModal({
  clip,
  isOpen,
  onClose,
  onSave,
}: ClipEditorModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<SubtitlePreset>(
    (clip.subtitlePreset as SubtitlePreset) || "HORMOZI",
  );
  const [words, setWords] = useState<TranscriptWordItem[]>([]);
  const [transcriptText, setTranscriptText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const initialWords = parseTranscriptWords(clip.transcriptWords);
      setWords(initialWords);
      setTranscriptText(initialWords.map((w) => w.word).join(" "));
      setSelectedPreset((clip.subtitlePreset as SubtitlePreset) || "HORMOZI");
    }
  }, [isOpen, clip]);

  if (!isOpen) return null;

  const handleTextChange = (text: string) => {
    setTranscriptText(text);
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    const updatedWords = tokens.map((token, idx) => ({
      word: token,
      start: words[idx]?.start ?? idx * 0.5,
      end: words[idx]?.end ?? (idx + 1) * 0.5,
    }));
    setWords(updatedWords);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (onSave) {
        await onSave({
          subtitlePreset: selectedPreset,
          transcriptWords: words,
        });
      } else {
        const res = await updateClip(clip.id, {
          subtitlePreset: selectedPreset,
          transcriptWords: words,
        });
        if (!res.success) {
          throw new Error(res.error ?? "Erro ao salvar alterações");
        }
      }
      toast.success("Alterações salvas! Re-renderização iniciada.");
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro inesperado ao salvar clipe.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clip-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-xs animate-in fade-in duration-200"
    >
      {/* Modal Card */}
      <div
        className="relative w-full max-w-xl rounded-xl border bg-card p-6 shadow-2xl text-card-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b pb-4">
          <div>
            <h2 id="clip-editor-title" className="text-lg font-semibold flex items-center gap-2">
              <Subtitles className="h-5 w-5 text-primary" />
              Editar Legendas e Transcrição
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Personalize o estilo visual e ajuste as palavras faladas no clipe: &ldquo;{clip.title}&rdquo;
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Fechar"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-6 py-4">
          {/* Preset Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Estilo de Legenda
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {SUBTITLE_PRESETS.map((preset) => {
                const isSelected = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="font-semibold text-xs text-foreground">
                        {preset.name}
                      </span>
                      <Badge
                        variant={isSelected ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {preset.badge}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {preset.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Transcript Words Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="transcript-editor"
                className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Palavras da Transcrição
              </Label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {words.length} palavra{words.length !== 1 ? "s" : ""}
              </span>
            </div>
            <textarea
              id="transcript-editor"
              data-testid="transcript-input"
              value={transcriptText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Digite ou edite a transcrição das palavras do clipe..."
              rows={4}
              className="w-full rounded-md border border-input bg-background p-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            />
          </div>

          {/* Words Preview Chips */}
          {words.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                Prévia das Palavras e Timestamps:
              </span>
              <div className="max-h-28 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2.5 flex flex-wrap gap-1.5">
                {words.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 text-xs border border-border/80"
                    title={`${item.start?.toFixed(1)}s - ${item.end?.toFixed(1)}s`}
                  >
                    <span className="font-medium text-foreground">{item.word}</span>
                    {typeof item.start === "number" && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {item.start.toFixed(1)}s
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-1.5"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Re-renderizando...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-amber-300" />
                <span>Salvar e Re-renderizar</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
