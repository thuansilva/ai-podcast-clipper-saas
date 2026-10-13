"use client";

import { useRef } from "react";

/**
 * Devolve o foco ao elemento que estava focado quando o diálogo abriu (WCAG 2.4.3).
 *
 * O Radix só devolve o foco ao `Dialog.Trigger`. Os modais de clipe são abertos
 * por botões que ficam FORA do `Dialog.Root` (ex.: botões de ação do ClipCard),
 * então capturamos o elemento no momento em que o conteúdo recebe o foco
 * inicial (`onOpenAutoFocus` roda antes do foco ser movido para dentro) e o
 * restauramos em `onCloseAutoFocus`.
 */
export function useDialogFocusReturn() {
  const openerRef = useRef<HTMLElement | null>(null);

  return {
    onOpenAutoFocus: () => {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      openerRef.current?.focus();
    },
  };
}
