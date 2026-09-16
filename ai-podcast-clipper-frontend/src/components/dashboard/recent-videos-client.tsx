"use client";

import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Loader2, PlayCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface RecentVideosClientProps {
  uploadedFiles: {
    id: string;
    s3Key: string;
    filename: string;
    status: string;
    clipsCount: number;
    createdAt: Date;
    thumbnailUrl?: string;
  }[];
}

export function RecentVideosClient({ uploadedFiles }: RecentVideosClientProps) {
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const wasProcessingRef = useRef<boolean>(false);

  const hasActiveProcessing = uploadedFiles.some(
    (file) => file.status === "queued" || file.status === "processing",
  );

  useEffect(() => {
    if (hasActiveProcessing) {
      wasProcessingRef.current = true;
      const interval = setInterval(() => {
        router.refresh();
      }, 4000);
      return () => clearInterval(interval);
    } else if (wasProcessingRef.current) {
      wasProcessingRef.current = false;
      toast.success("Seus clipes estão prontos!");
    }
  }, [hasActiveProcessing, router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">Visão Geral</h1>
        <p className="text-sm text-[var(--fumaca)]">Acompanhe seus últimos projetos e processamentos em andamento.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {uploadedFiles.map((file) => {
          const isProcessing = file.status === "queued" || file.status === "processing";
          const isFailed = file.status === "failed" || file.status === "no credits";
          
          return (
            <Card key={file.id} className="overflow-hidden border border-[var(--linha)] bg-[var(--superficie)] rounded-2xl transition-all hover:border-[var(--linha-2)]">
              <div className="relative aspect-video bg-[var(--superficie-2)] overflow-hidden">
                {/* Thumbnail */}
                <div 
                  className={`absolute inset-0 bg-cover bg-center transition-all ${isProcessing ? "blur-sm scale-105 opacity-60" : "opacity-90"}`}
                  style={{ backgroundImage: `url(${file.thumbnailUrl || "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600&auto=format&fit=crop"})` }}
                />
                
                {/* Overlay status (Blur effect) */}
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--tinta)]/40 z-10">
                    <Badge variant="outline" className="text-sm px-3 py-1 font-mono tracking-widest uppercase bg-[var(--ouro)]/10 text-[var(--ouro)] border-[var(--ouro)]/50 shadow-[0_0_15px_rgba(232,186,82,0.3)] animate-pulse">
                      Processando...
                    </Badge>
                  </div>
                )}
                
                {isFailed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--perigo)]/20 z-10">
                    <Badge variant="destructive" className="uppercase tracking-widest font-mono text-xs">
                      {file.status === "no credits" ? "Sem Créditos" : "Falha"}
                    </Badge>
                  </div>
                )}
                
                {!isProcessing && !isFailed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--tinta)]/20 opacity-0 hover:opacity-100 transition-opacity z-10 cursor-pointer">
                    <PlayCircleIcon className="h-12 w-12 text-[var(--marfim)] opacity-80" />
                  </div>
                )}
              </div>
              
              <CardContent className="p-4">
                <h3 className="font-semibold text-[var(--marfim)] truncate">{file.filename}</h3>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-[var(--fumaca)] font-mono">{new Date(file.createdAt).toLocaleDateString()}</span>
                  {!isProcessing && !isFailed && (
                    <span className="text-xs font-mono text-[var(--patina)] font-medium bg-[var(--patina)]/10 px-2 py-0.5 rounded-full border border-[var(--patina)]/20">
                      {file.clipsCount} clips
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
        
        {uploadedFiles.length === 0 && (
          <div className="col-span-full py-20 text-center border border-dashed border-[var(--linha-2)] rounded-2xl bg-[var(--superficie-2)]/30">
            <p className="text-[var(--fumaca)]">Nenhum projeto recente.</p>
          </div>
        )}
      </div>
    </div>
  );
}
