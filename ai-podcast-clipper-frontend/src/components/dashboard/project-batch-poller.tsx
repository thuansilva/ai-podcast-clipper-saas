"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 5000;

interface ProjectBatchPollerProps {
  /** Quantidade de cortes em geração (0 = nenhum lote ativo). */
  activeCount: number;
}

/**
 * Faz `router.refresh()` a cada 5s enquanto houver lote de "adicionar cortes"
 * ativo (mesmo padrão de `recent-videos-client.tsx`) e para quando não houver
 * mais. Também mantém a região `role="status"` (aria-live polite, só para
 * leitores de tela) que anuncia o início e o fim da geração; fica sempre
 * montada para detectar a transição ativo -> nenhum.
 */
export function ProjectBatchPoller({ activeCount }: ProjectBatchPollerProps) {
  const router = useRouter();
  const wasActiveRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");
  const isActive = activeCount > 0;

  useEffect(() => {
    if (isActive) {
      wasActiveRef.current = true;
      const interval = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
      return () => clearInterval(interval);
    }
    if (wasActiveRef.current) {
      wasActiveRef.current = false;
      toast.success("Novos cortes prontos!");
      setAnnouncement("Geração concluída. Novos cortes disponíveis.");
    }
  }, [isActive, router]);

  const message = isActive
    ? `Gerando ${activeCount} ${activeCount === 1 ? "corte" : "cortes"}. A página atualiza sozinha.`
    : announcement;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sr-only"
      data-testid="clips-generation-live-region"
    >
      {message}
    </div>
  );
}
