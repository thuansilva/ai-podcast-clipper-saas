"use client";

import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  horizontalScroll?: boolean;
}

export function RecentVideosClient({
  uploadedFiles,
  title = "Visão Geral",
  description = "Acompanhe seus últimos projetos e processamentos em andamento.",
  hideHeader = false,
  emptyMessage = "Nenhum projeto recente.",
  horizontalScroll = false,
}: RecentVideosClientProps) {
  
  const router = useRouter();
  const wasProcessingRef = useRef<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

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

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    if (horizontalScroll) {
      checkScroll();
      window.addEventListener("resize", checkScroll);
      return () => window.removeEventListener("resize", checkScroll);
    }
  }, [horizontalScroll, uploadedFiles]);

  const scrollByAmount = (offset: number) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: offset, behavior: "smooth" });
      setTimeout(checkScroll, 300);
    }
  };

  const containerClassName = horizontalScroll 
    ? "flex overflow-x-auto pb-4 gap-4 sm:gap-6 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" 
    : "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6";

  const itemClassName = horizontalScroll
    ? "block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)] rounded-2xl min-w-[200px] sm:min-w-[240px] max-w-[280px] shrink-0 snap-start"
    : "block group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ouro)] rounded-2xl";

  return (
    <div className="space-y-6 relative group/carousel">
      {!hideHeader && (
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)]">{title}</h1>
          <p className="text-sm text-[var(--fumaca)]">{description}</p>
        </div>
      )}

      {horizontalScroll && canScrollLeft && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollByAmount(-300); }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-50 bg-[var(--superficie)] border border-[var(--linha)] text-[var(--marfim)] hover:text-[var(--ouro)] hover:border-[var(--ouro)] rounded-full p-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)] opacity-0 group-hover/carousel:opacity-100 transition-all duration-200 cursor-pointer"
          aria-label="Rolar para a esquerda"
        >
          <ChevronLeft className="w-5 h-5" pointerEvents="none" />
        </button>
      )}

      {horizontalScroll && canScrollRight && uploadedFiles.length > 0 && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); scrollByAmount(300); }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-50 bg-[var(--superficie)] border border-[var(--linha)] text-[var(--marfim)] hover:text-[var(--ouro)] hover:border-[var(--ouro)] rounded-full p-2 shadow-[0_4px_20px_rgba(0,0,0,0.5)] opacity-0 group-hover/carousel:opacity-100 transition-all duration-200 cursor-pointer"
          aria-label="Rolar para a direita"
        >
          <ChevronRight className="w-5 h-5" pointerEvents="none" />
        </button>
      )}

      <div 
        ref={scrollContainerRef}
        onScroll={horizontalScroll ? checkScroll : undefined}
        className={containerClassName}
      >
        {uploadedFiles.map((file) => {
          const isProcessing = file.status === "queued" || file.status === "processing";
          const isFailed = file.status === "failed" || file.status === "no credits";
          
          return (
            <Link
              key={file.id}
              href={`/dashboard/projects/${file.id}`}
              className={itemClassName}
            >
              <Card className="overflow-hidden border border-[var(--linha)] bg-[var(--superficie)] rounded-2xl transition-all group-hover:border-[var(--linha-2)] flex flex-col h-full">
                <div className="relative aspect-video bg-[var(--superficie-2)] overflow-hidden shrink-0">
                  {/* Thumbnail */}
                  <div 
                    className={`absolute inset-0 bg-cover bg-center transition-all ${isProcessing ? "blur-sm scale-105 opacity-60" : "opacity-90 group-hover:opacity-100"}`}
                    style={{ backgroundImage: `url(${file.thumbnailUrl || "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=600&auto=format&fit=crop"})` }}
                  />
                  
                  {!isProcessing && !isFailed && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--tinta)]/10 group-hover:bg-[var(--tinta)]/30 transition-colors z-10 cursor-pointer opacity-100">
                      <div className="cursor-pointer drop-shadow-md transition-transform group-hover:scale-105">
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
                    <span className="text-[10px] sm:text-xs text-[var(--fumaca)] font-mono">{new Date(file.createdAt).toLocaleDateString("pt-BR")}</span>
                    
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
            </Link>
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
