"use client";

import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useEffect, useRef } from "react";
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
  title?: string;
  description?: string;
  hideHeader?: boolean;
  emptyMessage?: string;
}

export function RecentVideosClient({
  uploadedFiles,
  title = "Visão Geral",
  description = "Acompanhe seus últimos projetos e processamentos em andamento.",
  hideHeader = false,
  emptyMessage = "Nenhum projeto recente.",
}: RecentVideosClientProps) {
  
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
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">{title}</h1>
          <p className="text-sm text-[var(--fumaca)]">{description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
        {uploadedFiles.map((file) => {
          const isProcessing = file.status === "queued" || file.status === "processing";
          const isFailed = file.status === "failed" || file.status === "no credits";
          
          return (
            <Card key={file.id} className="overflow-hidden border border-[var(--linha)] bg-[var(--superficie)] rounded-2xl transition-all hover:border-[var(--linha-2)] flex flex-col">
              <div className="relative aspect-[9/16] bg-[var(--superficie-2)] overflow-hidden shrink-0">
                {/* Thumbnail */}
                <div 
                  className={`absolute inset-0 bg-cover bg-center transition-all ${isProcessing ? "blur-sm scale-105 opacity-60" : "opacity-90"}`}
                  style={{ backgroundImage: `url(${file.thumbnailUrl || "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600&auto=format&fit=crop"})` }}
                />
                
                {!isProcessing && !isFailed && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[var(--tinta)]/10 hover:bg-[var(--tinta)]/30 transition-colors z-10 cursor-pointer opacity-100">
                    <div className="cursor-pointer drop-shadow-md transition-transform hover:scale-105">
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fillRule="evenodd" clipRule="evenodd" shapeRendering="geometricPrecision" d="M24 48C37.2548 48 48 37.2548 48 24C48 10.7452 37.2548 0 24 0C10.7452 0 0 10.7452 0 24C0 37.2548 10.7452 48 24 48ZM22.6641 15.5039C21.7435 14.8901 20.5599 14.8329 19.5844 15.355C18.609 15.877 18 16.8936 18 18V30C18 31.1064 18.609 32.123 19.5844 32.645C20.5599 33.1671 21.7435 33.1099 22.6641 32.4962L31.6641 26.4962C32.4987 25.9398 33 25.0031 33 24C33 22.9969 32.4987 22.0603 31.6641 21.5039L22.6641 15.5039Z" fill="white"></path>
                      </svg>
                    </div>
                  </div>
                )}
              </div>
              
              <CardContent className="p-3 sm:p-4 flex flex-col justify-between flex-1 gap-2">
                <h3 className="font-semibold text-xs sm:text-sm text-[var(--marfim)] line-clamp-2" title={file.filename}>
                  {file.filename}
                </h3>
                <div className="flex justify-between items-center mt-auto pt-2 border-t border-[var(--linha)]/50">
                  <span className="text-[10px] sm:text-xs text-[var(--fumaca)] font-mono">{new Date(file.createdAt).toLocaleDateString()}</span>
                  
                  {isProcessing ? (
                    <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0 sm:px-2 sm:py-0.5 font-mono uppercase bg-[var(--ouro)]/10 text-[var(--ouro)] border-[var(--ouro)]/50 shadow-[0_0_10px_rgba(232,186,82,0.15)] animate-pulse">
                      Proc...
                    </Badge>
                  ) : isFailed ? (
                    <Badge variant="destructive" className="text-[9px] sm:text-[10px] px-1.5 py-0 sm:px-2 sm:py-0.5 uppercase tracking-wider font-mono">
                      {file.status === "no credits" ? "S/ Crédito" : "Falha"}
                    </Badge>
                  ) : (
                    <span className="text-[9px] sm:text-[10px] font-mono text-[var(--patina)] font-medium bg-[var(--patina)]/10 px-1.5 py-0 sm:px-2 sm:py-0.5 rounded-full border border-[var(--patina)]/20">
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
            <p className="text-[var(--fumaca)]">{emptyMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
