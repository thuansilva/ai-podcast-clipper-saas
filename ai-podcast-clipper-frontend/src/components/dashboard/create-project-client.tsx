"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Loader2, ScissorsIcon, YoutubeIcon, UploadCloudIcon } from "lucide-react";
import { toast } from "sonner";
import { importYouTubeVideo } from "~/actions/youtube";
import { Slider } from "~/components/ui/slider";

interface VideoMetadata {
  title: string;
  durationSeconds: number;
  thumbnailUrl?: string;
}

export function CreateProjectClient({ userCredits }: { userCredits: number }) {
  const [url, setUrl] = useState("");
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  
  const [range, setRange] = useState([0, 5]);
  const [preset, setPreset] = useState("HORMOZI");
  const [processing, setProcessing] = useState(false);

  const router = useRouter();

  const handleFetchMeta = async (targetUrl: string) => {
    if (!targetUrl) return;
    setLoadingMeta(true);
    try {
      const res = await fetch(`/api/youtube/info?url=${encodeURIComponent(targetUrl)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch metadata");
      
      setMetadata(data);
      const defaultDuration = Math.min(5 * 60, data.durationSeconds);
      setRange([0, Math.floor(defaultDuration / 60)]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingMeta(false);
    }
  };

  // Auto-fetch quando a URL parece ser do YouTube
  useEffect(() => {
    if (url && (url.includes("youtube.com/watch") || url.includes("youtu.be/"))) {
      // Debounce simples para evitar múltiplas chamadas se o usuário estiver digitando
      const timer = setTimeout(() => {
        handleFetchMeta(url);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [url]);

  const startMin = range[0];
  const endMin = range[1];
  const cost = Math.max(1, endMin - startMin);

  const handleSubmit = async () => {
    if (!url || !metadata) return;
    
    if (cost > userCredits) {
      toast.error(`Você precisa de ${cost} créditos, mas tem apenas ${userCredits}.`);
      return;
    }

    setProcessing(true);
    try {
      const result = await importYouTubeVideo({
        url,
        preset,
        sliceStartTime: startMin * 60,
        sliceEndTime: endMin * 60,
        mode: "auto"
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      toast.success("Vídeo enviado para processamento!");
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || "Ocorreu um erro ao processar o vídeo.");
      setProcessing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">Criar Novo Projeto</h1>
        <p className="text-sm text-[var(--fumaca)]">Cole a URL, defina o tempo de corte e deixe a Inteligência Artificial fazer o resto.</p>
      </div>

      {!metadata ? (
        <div className="space-y-6">
          <Card className="bg-[var(--superficie)] border-[var(--linha)]">
            <CardHeader>
              <CardTitle className="text-lg text-[var(--marfim)]">Importar do YouTube</CardTitle>
              <CardDescription className="text-[var(--fumaca)]">Copie e cole o link do vídeo para começarmos</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <YoutubeIcon className="absolute left-3 top-2.5 h-5 w-5 text-[var(--linha-2)]" />
                <Input
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="pl-10 pr-10 bg-[var(--tinta)] border-[var(--linha)] text-[var(--marfim)]"
                />
                {loadingMeta && (
                  <div className="absolute right-3 top-2.5">
                    <Loader2 className="h-5 w-5 text-[var(--ouro)] animate-spin" />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[var(--linha)]" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[var(--tinta)] px-2 text-[var(--fumaca)]">Ou</span>
            </div>
          </div>
          
          <Card className="bg-[var(--superficie)] border-[var(--linha)] border-dashed opacity-70 hover:opacity-100 transition-opacity cursor-pointer">
            <CardContent className="flex flex-col items-center justify-center p-8 text-center">
              <div className="rounded-full bg-[var(--superficie-2)] p-3 mb-4">
                <UploadCloudIcon className="h-6 w-6 text-[var(--marfim)]" />
              </div>
              <p className="text-sm font-medium text-[var(--marfim)]">Fazer upload de arquivo local</p>
              <p className="text-xs text-[var(--fumaca)] mt-1">MP4, MOV ou WebM (Em breve)</p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-4">
              <div className="rounded-xl overflow-hidden border border-[var(--linha)] bg-[var(--superficie)] shadow-lg">
                <img src={metadata.thumbnailUrl} alt="Thumbnail" className="w-full aspect-video object-cover" />
                <div className="p-4">
                  <p className="font-semibold text-sm text-[var(--marfim)] line-clamp-2">{metadata.title}</p>
                  <p className="text-xs text-[var(--fumaca)] mt-1">{Math.floor(metadata.durationSeconds / 60)} minutos totais</p>
                </div>
              </div>
            </div>
            
            <div className="md:col-span-8 space-y-6">
              <Card className="bg-[var(--superficie)] border-[var(--linha)]">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg text-[var(--marfim)] flex items-center gap-2">
                    <ScissorsIcon className="h-4 w-4 text-[var(--ouro)]" />
                    Fatiador Inteligente
                  </CardTitle>
                  <CardDescription className="text-[var(--fumaca)]">Deslize para selecionar o trecho que nossa IA deve analisar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                  
                  <div className="pt-4 pb-2 px-2">
                    <Slider
                      value={range}
                      min={0}
                      max={Math.floor(metadata.durationSeconds / 60)}
                      step={1}
                      onValueChange={(val) => {
                        // Impedir que os thumbs cruzem e mantenham min 1 minuto se possível
                        if (val[1] > val[0]) {
                          setRange(val);
                        } else if (val[1] === val[0]) {
                           // Força distância mínima de 1 minuto se não estiver no limite
                           if (val[1] < Math.floor(metadata.durationSeconds / 60)) {
                             setRange([val[0], val[1] + 1]);
                           } else {
                             setRange([val[0] - 1, val[1]]);
                           }
                        }
                      }}
                    />
                    <div className="flex justify-between mt-4 text-xs font-medium text-[var(--fumaca)]">
                      <span>{startMin} min</span>
                      <span>{endMin} min</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--ouro)]/10 border border-[var(--ouro)]/30 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-medium text-[var(--ouro)]">Custo do Processamento</p>
                      <p className="text-xs text-[var(--ouro)]/70">Você será cobrado apenas pelo trecho fatiado.</p>
                    </div>
                    <div className="text-2xl font-bold font-mono text-[var(--ouro)]">
                      {cost} <span className="text-sm font-normal">Créditos</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-[var(--marfim)]">Estilo da Legenda</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div 
                    onClick={() => setPreset("HORMOZI")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${preset === "HORMOZI" ? "bg-[var(--superficie-2)] border-[var(--ouro)] shadow-[0_0_15px_rgba(232,186,82,0.1)]" : "bg-[var(--superficie)] border-[var(--linha)] hover:border-[var(--linha-2)]"}`}
                  >
                    <p className="font-bold text-lg text-center text-yellow-400 drop-shadow-md italic uppercase">Viral Bold</p>
                    <p className="text-xs text-center text-[var(--fumaca)] mt-2">Cores chamativas e emojis</p>
                  </div>
                  <div 
                    onClick={() => setPreset("CLEAN")}
                    className={`cursor-pointer rounded-xl border p-4 transition-all ${preset === "CLEAN" ? "bg-[var(--superficie-2)] border-[var(--ouro)] shadow-[0_0_15px_rgba(232,186,82,0.1)]" : "bg-[var(--superficie)] border-[var(--linha)] hover:border-[var(--linha-2)]"}`}
                  >
                    <p className="font-semibold text-lg text-center text-white font-sans tracking-wide">Clean Corp</p>
                    <p className="text-xs text-center text-[var(--fumaca)] mt-2">Minimalista e elegante</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={() => setMetadata(null)}
                  className="flex-1 bg-transparent border-[var(--linha-2)] text-[var(--marfim-2)] hover:text-[var(--marfim)] hover:bg-[var(--superficie)]"
                >
                  Voltar
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={processing || cost > userCredits}
                  className="flex-2 w-full bg-[var(--ouro)] text-[var(--tinta)] hover:bg-[var(--ouro)]/90"
                >
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScissorsIcon className="mr-2 h-4 w-4" />}
                  Confirmar e Processar
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
