"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function VideosToolbar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const currentSearchParam = searchParams.get("search") ?? "";
  const currentSortParam = searchParams.get("sort") ?? "desc";

  const [searchTerm, setSearchTerm] = useState(currentSearchParam);

  // Sync internal search input state if URL search param changes
  useEffect(() => {
    setSearchTerm(currentSearchParam);
  }, [currentSearchParam]);

  // Debounced update for search input
  useEffect(() => {
    if (searchTerm === currentSearchParam) {
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchTerm.trim();

      if (trimmed) {
        params.set("search", trimmed);
      } else {
        params.delete("search");
      }

      // Reset to page 1 when search changes
      params.delete("page");

      const queryString = params.toString();
      const url = queryString ? `${pathname}?${queryString}` : pathname;

      startTransition(() => {
        router.push(url);
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, currentSearchParam, searchParams, pathname, router]);

  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (newSort === "asc") {
      params.set("sort", "asc");
    } else {
      params.set("sort", "desc");
    }

    // Reset to page 1 when sort changes
    params.delete("page");

    const queryString = params.toString();
    const url = queryString ? `${pathname}?${queryString}` : pathname;

    startTransition(() => {
      router.push(url);
    });
  };

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="search"
          placeholder="Buscar por nome do vídeo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8"
          aria-label="Buscar por nome"
        />
      </div>

      <div className="flex items-center gap-2">
        <Select value={currentSortParam} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[180px]" aria-label="Ordenar vídeos">
            <SelectValue placeholder="Ordenar por data" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Mais recentes</SelectItem>
            <SelectItem value="asc">Mais antigos</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
