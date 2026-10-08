"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useInView } from "react-intersection-observer";
import { RecentVideosClient } from "./recent-videos-client";
import { loadMoreProjectsAction } from "~/actions/projects-actions";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "~/components/ui/button";
import type { UploadedFileDTO } from "~/application/dtos/video-dtos";

interface InfiniteProjectsListProps {
  initialData: UploadedFileDTO[];
  initialTotalPages: number;
  search?: string;
  sort?: "asc" | "desc";
  emptyMessage?: string;
}

export function InfiniteProjectsList({
  initialData,
  initialTotalPages,
  search,
  sort,
  emptyMessage,
}: InfiniteProjectsListProps) {
  const [projects, setProjects] = useState<UploadedFileDTO[]>(initialData);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTotalPages > 1);
  const [, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const { ref, inView } = useInView();
  const requestIdRef = useRef(0);
  const isLoadingRef = useRef(false);

  // Reset when filters change. Em vez de um useEffect (que dispararia um
  // setState síncrono incondicional a cada mudança, causando uma
  // renderização em cascata extra), guardamos os últimos filtros vistos e
  // ajustamos o estado diretamente durante a renderização — o padrão
  // "Adjusting some state when a prop changes" documentado em
  // https://react.dev/learn/you-might-not-need-an-effect. A comparação por
  // referência contra `prevFilters` garante que o ajuste só rode uma vez
  // por mudança real (sem loop).
  const [prevFilters, setPrevFilters] = useState({
    initialData,
    search,
    sort,
    initialTotalPages,
  });
  if (
    prevFilters.initialData !== initialData ||
    prevFilters.search !== search ||
    prevFilters.sort !== sort ||
    prevFilters.initialTotalPages !== initialTotalPages
  ) {
    setPrevFilters({ initialData, search, sort, initialTotalPages });
    setProjects(initialData);
    setPage(1);
    setHasMore(initialTotalPages > 1);
    setHasError(false);
    setIsLoading(false);
  }

  // Refs não são lidos/mutados durante a renderização (ver
  // react-hooks/refs) — o cancelamento de requisições em andamento e a
  // liberação do "lock" de carregamento continuam presos a um efeito, que é
  // o lugar correto para mutar refs. O array de dependências aqui é só
  // sobre essas mesmas props de filtro, então este efeito dispara exatamente
  // nos mesmos commits em que o ajuste de estado acima acontece.
  useEffect(() => {
    requestIdRef.current++;
    isLoadingRef.current = false;
  }, [initialData, search, sort, initialTotalPages]);

  const handleRetry = useCallback(() => {
    setHasError(false);
  }, []);

  useEffect(() => {
    if (inView && hasMore && !isLoadingRef.current && !hasError) {
      isLoadingRef.current = true;
      setIsLoading(true);
      const nextPage = page + 1;
      const currentRequestId = requestIdRef.current;

      loadMoreProjectsAction(nextPage, search, sort)
        .then((res) => {
          if (currentRequestId !== requestIdRef.current) return;
          setProjects((prev) => {
            const existingIds = new Set(prev.map((item) => item.id));
            const uniqueNewItems = res.data.filter(
              (item) => !existingIds.has(item.id)
            );
            return [...prev, ...uniqueNewItems];
          });
          setPage(nextPage);
          setHasMore(res.currentPage < res.totalPages);
        })
        .catch((err) => {
          if (currentRequestId !== requestIdRef.current) return;
          console.error("Erro ao carregar mais projetos:", err);
          setHasError(true);
        })
        .finally(() => {
          if (currentRequestId === requestIdRef.current) {
            isLoadingRef.current = false;
            setIsLoading(false);
          }
        });
    }
  }, [inView, hasMore, hasError, page, search, sort]);

  const resolvedEmptyMessage =
    emptyMessage ??
    (search
      ? `Nenhum projeto encontrado para "${search}".`
      : "Nenhum projeto encontrado.");

  return (
    <div className="space-y-6">
      <RecentVideosClient
        uploadedFiles={projects}
        hideHeader
        emptyMessage={resolvedEmptyMessage}
      />
      {hasError && (
        <div
          className="flex flex-col items-center justify-center gap-2 py-6 text-sm text-[var(--fumaca)]"
          data-testid="load-more-error"
        >
          <div className="flex items-center gap-1.5 text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>Erro ao carregar mais projetos.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRetry}
            data-testid="retry-load-more"
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {!hasError && hasMore && (
        <div
          ref={ref}
          className="flex justify-center py-6"
          data-testid="infinite-scroll-trigger"
        >
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ouro)]" />
        </div>
      )}
    </div>
  );
}
