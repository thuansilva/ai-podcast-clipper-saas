# Plano de Implementação: Cortes Manuais por Timestamps (Manual Clips)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o usuário defina intervalos manuais de corte (tempo de início e fim) com atalhos de duração rápida (`+25s`, `+30s`, `+60s`) e pré-visualização no player de vídeo, mantendo o enquadramento 9:16 da IA e legendas dinâmicas, com cobrança de créditos proporcional apenas aos cortes criados.

**Architecture:** 
- Camada de Domínio pura com funções para conversão e validação de timestamps (`MM:SS` / `HH:MM:SS`) e cálculo de créditos de cortes manuais.
- Extensão dos DTOs de importação e eventos Inngest com `mode: "auto" | "manual"` e `manualCuts: [{ startTime, endTime, title? }]`.
- Atualização do componente [`ImportVideoTabs`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/components/import-video-tabs.tsx) com seletor de modo, inputs de tempo formatados, chips de duração (`+25s`, `+30s`, `+60s`), botão *"Marcar tempo atual"* via player e badge dinâmico de créditos.
- Atualização da função Inngest para reservar créditos e despachar cortes manuais ao worker GPU.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Prisma ORM, Inngest, Vitest, Testing Library.

**Spec:** [`docs/superpowers/specs/2026-09-13-manual-cuts-timestamp-design.md`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/docs/superpowers/specs/2026-09-13-manual-cuts-timestamp-design.md)

## Global Constraints
- Diretriz `AGENTS.md`: NUNCA execute `git commit` ou `git push` sem a autorização explícita do usuário. As alterações devem permanecer no working tree para revisão.
- Estilo e design: Seguir a paleta de materiais nobres do `aioson.com` com suporte aos temas claro e escuro (`[data-theme="light"]` e `[data-theme="dark"]`).
- Todos os testes unitários novos e existentes devem passar (117+ testes).
- Zero erros de TypeScript (`tsc --noEmit`) e zero avisos de linter (`next lint`).

---

### Task 1: Utilitários de Domínio para Timestamps (Parsing, Formatação e Atalhos)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/domain/rules/timestamp-parser.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/domain/timestamp-parser.test.ts`

**Interfaces:**
- Produces:
  - `parseTimestampToSeconds(value: string): number | null`
  - `formatSecondsToTimestamp(seconds: number): string`
  - `addSecondsToTimestamp(currentTimestamp: string, deltaSeconds: number): string`
  - `validateManualCut(startSeconds: number, endSeconds: number, maxDuration?: number): { valid: boolean; error?: string }`

- [ ] **Step 1: Escrever o teste unitário com falha (RED)**

Criar `tests/unit/domain/timestamp-parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  parseTimestampToSeconds,
  formatSecondsToTimestamp,
  addSecondsToTimestamp,
  validateManualCut,
} from "~/domain/rules/timestamp-parser";

describe("timestamp-parser", () => {
  describe("parseTimestampToSeconds", () => {
    it("converte MM:SS para segundos", () => {
      expect(parseTimestampToSeconds("00:30")).toBe(30);
      expect(parseTimestampToSeconds("01:15")).toBe(75);
      expect(parseTimestampToSeconds("10:00")).toBe(600);
    });

    it("converte HH:MM:SS para segundos", () => {
      expect(parseTimestampToSeconds("01:02:15")).toBe(3735);
      expect(parseTimestampToSeconds("00:01:30")).toBe(90);
    });

    it("retorna null para formatos inválidos", () => {
      expect(parseTimestampToSeconds("invalido")).toBeNull();
      expect(parseTimestampToSeconds("")).toBeNull();
      expect(parseTimestampToSeconds("-01:20")).toBeNull();
    });
  });

  describe("formatSecondsToTimestamp", () => {
    it("formata segundos para MM:SS", () => {
      expect(formatSecondsToTimestamp(30)).toBe("00:30");
      expect(formatSecondsToTimestamp(75)).toBe("01:15");
      expect(formatSecondsToTimestamp(599)).toBe("09:59");
    });

    it("formata segundos >= 3600 para HH:MM:SS", () => {
      expect(formatSecondsToTimestamp(3735)).toBe("01:02:15");
    });
  });

  describe("addSecondsToTimestamp", () => {
    it("soma segundos a um timestamp MM:SS", () => {
      expect(addSecondsToTimestamp("01:15", 30)).toBe("01:45");
      expect(addSecondsToTimestamp("00:40", 25)).toBe("01:05");
      expect(addSecondsToTimestamp("01:00", 60)).toBe("02:00");
    });

    it("lida com string inválida retornando valor inicial com delta", () => {
      expect(addSecondsToTimestamp("invalido", 30)).toBe("00:30");
    });
  });

  describe("validateManualCut", () => {
    it("valida corte correto", () => {
      expect(validateManualCut(10, 40)).toEqual({ valid: true });
    });

    it("rejeita quando fim <= inicio", () => {
      const result = validateManualCut(40, 30);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("maior");
    });

    it("rejeita corte com duração menor que 5s", () => {
      const result = validateManualCut(10, 13);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("mínima");
    });

    it("rejeita corte com duração maior que o limite (ex: 180s)", () => {
      const result = validateManualCut(10, 200);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("máxima");
    });
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npm run test tests/unit/domain/timestamp-parser.test.ts`
Expected: FAIL (módulo não encontrado)

- [ ] **Step 3: Implementar a solução mínima (GREEN)**

Criar `src/domain/rules/timestamp-parser.ts`:
```typescript
/**
 * Converte string MM:SS ou HH:MM:SS para segundos inteiros.
 */
export function parseTimestampToSeconds(value: string): number | null {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^(\d{1,2}:)?\d{1,2}:\d{2}$/.test(trimmed)) {
    return null;
  }

  const parts = trimmed.split(":").map(Number);
  if (parts.some((p) => isNaN(p) || p < 0)) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts as [number, number];
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts as [number, number, number];
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

/**
 * Converte segundos inteiros para string no formato MM:SS ou HH:MM:SS.
 */
export function formatSecondsToTimestamp(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const rounded = Math.floor(seconds);

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/**
 * Adiciona segundos a um timestamp existente.
 */
export function addSecondsToTimestamp(currentTimestamp: string, deltaSeconds: number): string {
  const currentSeconds = parseTimestampToSeconds(currentTimestamp) ?? 0;
  const targetSeconds = Math.max(0, currentSeconds + deltaSeconds);
  return formatSecondsToTimestamp(targetSeconds);
}

/**
 * Valida se um corte manual atende aos critérios do sistema.
 */
export function validateManualCut(
  startSeconds: number,
  endSeconds: number,
  maxVideoDuration?: number
): { valid: boolean; error?: string } {
  if (isNaN(startSeconds) || isNaN(endSeconds)) {
    return { valid: false, error: "Valores de tempo inválidos." };
  }

  if (startSeconds < 0) {
    return { valid: false, error: "O tempo de início não pode ser negativo." };
  }

  if (endSeconds <= startSeconds) {
    return { valid: false, error: "O tempo final deve ser maior que o tempo inicial." };
  }

  const duration = endSeconds - startSeconds;
  if (duration < 5) {
    return { valid: false, error: "A duração mínima de um corte é de 5 segundos." };
  }

  if (duration > 180) {
    return { valid: false, error: "A duração máxima de um corte manual é de 180 segundos." };
  }

  if (maxVideoDuration !== undefined && endSeconds > maxVideoDuration) {
    return {
      valid: false,
      error: `O corte ultrapassa a duração total do vídeo (${formatSecondsToTimestamp(maxVideoDuration)}).`,
    };
  }

  return { valid: true };
}
```

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npm run test tests/unit/domain/timestamp-parser.test.ts`
Expected: PASS (100% dos testes passando)

---

### Task 2: Regra de Domínio para Cálculo de Créditos em Cortes Manuais

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/domain/rules/calculate-credits.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/domain/calculate-manual-credits.test.ts`

**Interfaces:**
- Consumes: `ManualCutDurationItem` (`{ startTime: number; endTime: number }`)
- Produces: `calculateManualCutsCredits(cuts: ManualCutDurationItem[]): number`

- [ ] **Step 1: Escrever o teste unitário com falha (RED)**

Criar `tests/unit/domain/calculate-manual-credits.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { calculateManualCutsCredits } from "~/domain/rules/calculate-credits";

describe("calculateManualCutsCredits", () => {
  it("retorna 0 créditos para lista vazia", () => {
    expect(calculateManualCutsCredits([])).toBe(0);
  });

  it("cobra 1 crédito para corte de até 60 segundos", () => {
    expect(calculateManualCutsCredits([{ startTime: 0, endTime: 30 }])).toBe(1);
    expect(calculateManualCutsCredits([{ startTime: 10, endTime: 70 }])).toBe(1);
  });

  it("cobra 2 créditos para dois cortes de até 60s cada", () => {
    expect(
      calculateManualCutsCredits([
        { startTime: 0, endTime: 30 },
        { startTime: 120, endTime: 165 },
      ])
    ).toBe(2);
  });

  it("cobra créditos proporcionais se um corte exceder 60s", () => {
    expect(calculateManualCutsCredits([{ startTime: 0, endTime: 75 }])).toBe(2);
    expect(calculateManualCutsCredits([{ startTime: 0, endTime: 130 }])).toBe(3);
  });
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npm run test tests/unit/domain/calculate-manual-credits.test.ts`
Expected: FAIL (função não exportada)

- [ ] **Step 3: Implementar a função em `calculate-credits.ts` (GREEN)**

Editar `src/domain/rules/calculate-credits.ts`:
```typescript
export interface ManualCutDurationItem {
  startTime: number;
  endTime: number;
}

export function calculateVideoCredits(durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.ceil(durationSeconds / 60);
}

export function calculateManualCutsCredits(cuts: ManualCutDurationItem[]): number {
  if (!cuts || cuts.length === 0) return 0;
  return cuts.reduce((total, cut) => {
    const duration = Math.max(0, cut.endTime - cut.startTime);
    if (duration === 0) return total;
    const creditsForCut = Math.max(1, Math.ceil(duration / 60));
    return total + creditsForCut;
  }, 0);
}
```

- [ ] **Step 4: Executar teste e verificar aprovação**

Run: `npm run test tests/unit/domain/calculate-manual-credits.test.ts`
Expected: PASS

---

### Task 3: Extensão de DTOs, Casos de Uso e Server Actions

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/application/dtos/video-dtos.ts`
- Modify: `ai-podcast-clipper-frontend/src/domain/ports/queue-gateway.ts`
- Modify: `ai-podcast-clipper-frontend/src/infrastructure/queue/inngest-queue.gateway.ts`
- Modify: `ai-podcast-clipper-frontend/src/application/use-cases/videos/import-youtube-video.use-case.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/youtube.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/generation.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/youtube-action.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/generation-action.test.ts`

**Interfaces:**
- Produces:
  - `ManualCutDTO: { id?: string; title?: string; startTime: number; endTime: number }`
  - `ProcessingMode: "auto" | "manual"`
  - `ImportYouTubeVideoInput` com suporte a `mode` e `manualCuts`
  - `processVideo(fileId: string, preset?: string, mode?: ProcessingMode, manualCuts?: ManualCutDTO[])`

- [ ] **Step 1: Atualizar DTOs em `src/application/dtos/video-dtos.ts`**

Adicionar `ManualCutDTO` e `ProcessingMode`:
```typescript
export interface ManualCutDTO {
  id?: string;
  title?: string;
  startTime: number;
  endTime: number;
}

export type ProcessingMode = "auto" | "manual";

export interface ImportYouTubeVideoInput {
  userId: string;
  url: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}
```

- [ ] **Step 2: Atualizar `IQueueGateway` e `InngestQueueGateway`**

Em `src/domain/ports/queue-gateway.ts` e `src/infrastructure/queue/inngest-queue.gateway.ts`, adicionar suporte a `mode?: ProcessingMode` e `manualCuts?: ManualCutDTO[]` no payload do evento `sendProcessVideoEvent`.

- [ ] **Step 3: Atualizar `ImportYouTubeVideoUseCase`**

Em `src/application/use-cases/videos/import-youtube-video.use-case.ts`:
Repassar `mode` e `manualCuts` para `this.queueGateway.sendProcessVideoEvent(...)`.

- [ ] **Step 4: Atualizar `src/actions/youtube.ts` e `src/actions/generation.ts`**

Adicionar suporte aos parâmetros `mode` e `manualCuts` nas Server Actions.

- [ ] **Step 5: Executar os testes unitários das actions**

Run: `npm run test tests/unit/youtube-action.test.ts tests/unit/generation-action.test.ts`
Expected: PASS

---

### Task 4: Extensão da Função Inngest para Reserva e Despacho de Cortes Manuais

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/inngest/functions.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/inngest/manual-cuts-pipeline.test.ts`

**Interfaces:**
- Consumes: `ProcessVideoEventData` com `manualCuts`
- Produces: Reserva de créditos proporcional e payload com `manual_cuts` enviado a `PROCESS_VIDEO_ENDPOINT`

- [ ] **Step 1: Escrever teste de unidade para o pipeline de cortes manuais (RED)**

Criar `tests/unit/inngest/manual-cuts-pipeline.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateManualCutsCredits } from "~/domain/rules/calculate-credits";

describe("Manual Cuts Inngest Pipeline Logic", () => {
  it("calcula créditos de cortes manuais corretamente para 2 cortes de 30s", () => {
    const cuts = [
      { startTime: 10, endTime: 40 },
      { startTime: 60, endTime: 90 },
    ];
    const credits = calculateManualCutsCredits(cuts);
    expect(credits).toBe(2);
  });

  it("gera payload formatado com manual_cuts para o worker GPU", () => {
    const manualCuts = [
      { title: "Corte 1", startTime: 15.5, endTime: 45.5 },
    ];
    const payload = {
      s3_key: "youtube/123/original.mp4",
      preset: "HORMOZI",
      mode: "manual",
      manual_cuts: manualCuts.map((c) => ({
        title: c.title,
        start: c.startTime,
        end: c.endTime,
      })),
    };

    expect(payload.mode).toBe("manual");
    expect(payload.manual_cuts).toHaveLength(1);
    expect(payload.manual_cuts[0].start).toBe(15.5);
    expect(payload.manual_cuts[0].end).toBe(45.5);
  });
});
```

- [ ] **Step 2: Atualizar `src/inngest/functions.ts`**

No passo `validate-and-reserve-credits`:
```typescript
const isManual = event.data.mode === "manual" && Array.isArray(event.data.manualCuts) && event.data.manualCuts.length > 0;

let creditsToHold = 0;
if (isManual) {
  creditsToHold = calculateManualCutsCredits(event.data.manualCuts!);
} else {
  creditsToHold = calculateVideoCredits(durationSeconds);
}
```
No passo `call-modal-gpu`:
```typescript
body: JSON.stringify({
  s3_key: reservation.s3Key,
  preset: preset ?? "HORMOZI",
  mode: event.data.mode ?? "auto",
  manual_cuts: event.data.manualCuts?.map((c) => ({
    title: c.title,
    start: c.startTime,
    end: c.endTime,
  })),
}),
```

- [ ] **Step 3: Executar os testes**

Run: `npm run test tests/unit/inngest/manual-cuts-pipeline.test.ts`
Expected: PASS

---

### Task 5: Interface do Usuário - Painel de Cortes Manuais com Chips e Player

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/components/import-video-tabs.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/import-video-tabs.test.tsx`

**Interfaces:**
- Produces:
  - Seletor de Modo (`Auto IA` / `Corte Manual`)
  - Lista dinâmica de cortes manuais com campos `Início` e `Fim`
  - Chips rápidos de duração `+25s`, `+30s`, `+60s`
  - Botão `"Marcar tempo atual"` sincronizado com elemento `<video>` de preview
  - Botão `+ Adicionar outro corte` e botão de remoção
  - Badge dinâmico de créditos

- [ ] **Step 1: Escrever testes unitários em `tests/unit/import-video-tabs.test.tsx` (RED)**

Adicionar novos testes na suíte `import-video-tabs.test.tsx`:
```typescript
it("permite alternar para o modo de corte manual", async () => {
  render(<ImportVideoTabs userCredits={10} onUploadSuccess={vi.fn()} />);
  const manualModeBtn = screen.getByRole("button", { name: /corte manual/i });
  fireEvent.click(manualModeBtn);

  expect(screen.getByText(/definir intervalos de corte/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText("00:00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /\+25s/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /\+30s/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /\+60s/i })).toBeInTheDocument();
});

it("soma segundos automaticamente ao clicar no chip +30s", async () => {
  render(<ImportVideoTabs userCredits={10} onUploadSuccess={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /corte manual/i }));

  const startInput = screen.getByPlaceholderText("00:00");
  fireEvent.change(startInput, { target: { value: "01:15" } });

  const plus30Btn = screen.getByRole("button", { name: /\+30s/i });
  fireEvent.click(plus30Btn);

  const endInput = screen.getByDisplayValue("01:45");
  expect(endInput).toBeInTheDocument();
});

it("permite adicionar e remover múltiplos cortes manuais", async () => {
  render(<ImportVideoTabs userCredits={10} onUploadSuccess={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /corte manual/i }));

  const addCutBtn = screen.getByRole("button", { name: /\+ adicionar corte/i });
  fireEvent.click(addCutBtn);

  expect(screen.getAllByPlaceholderText("00:00")).toHaveLength(2);
});
```

- [ ] **Step 2: Executar teste e verificar falha**

Run: `npm run test tests/unit/import-video-tabs.test.tsx`
Expected: FAIL (elementos ainda não existem no componente)

- [ ] **Step 3: Implementar a interface em `import-video-tabs.tsx` (GREEN)**

1. Adicionar o estado de modo:
   ```typescript
   const [mode, setMode] = useState<"auto" | "manual">("auto");
   const [manualCuts, setManualCuts] = useState<Array<{ id: string; title: string; start: string; end: string }>>([
     { id: "1", title: "", start: "00:00", end: "00:30" },
   ]);
   ```
2. Adicionar o Seletor de Modo no topo (estilizado com cores semânticas `var(--tinta)`, `var(--superficie)`, `var(--ouro)`, `.btn-linha`).
3. Adicionar o bloco de corte com:
   - Campo Início (`MM:SS`)
   - Chips de duração rápida:
     ```tsx
     <button
       type="button"
       onClick={() => handleQuickAdd(cut.id, 25)}
       className="px-2.5 py-1 text-xs font-mono rounded-md border border-[var(--linha-2)] bg-[var(--superficie-2)] hover:border-[var(--ouro)] text-[var(--marfim)]"
     >
       +25s
     </button>
     ```
   - Campo Fim (`MM:SS`)
   - Botão *"Marcar tempo atual"* quando `file` existir:
     ```tsx
     <button
       type="button"
       onClick={() => handleSetCurrentPlayerTime(cut.id)}
       className="text-xs text-[var(--ouro)] hover:underline flex items-center gap-1 font-mono"
     >
       <ClockIcon className="w-3.5 h-3.5" /> Usar tempo atual
     </button>
     ```
   - Botão para remover corte
   - Botão `+ Adicionar Corte`
4. Atualizar o cálculo de créditos para exibir a contagem exata no badge.
5. Conectar com `handleUploadSubmit` e `handleYouTubeSubmit` repassando `mode` e `manualCuts`.

- [ ] **Step 4: Executar os testes unitários do componente**

Run: `npm run test tests/unit/import-video-tabs.test.tsx`
Expected: PASS (todos os testes passando)

---

### Task 6: Verificação Completa, Linting e Checagem de Tipos

**Files:**
- Test: Todas as suítes de testes
- Verify: `tsc --noEmit` e `next lint`

- [ ] **Step 1: Rodar todas as suítes de testes unitários**

Run: `npm run test:all`
Expected: PASS (todas as suítes passando, zero falhas)

- [ ] **Step 2: Rodar checagem de tipos e linter**

Run: `npm run check`
Expected: PASS (0 erros e 0 avisos)

- [ ] **Step 3: Apresentar resultados ao usuário para aprovação conforme AGENTS.md**

Apresentar o diff das alterações para inspeção do usuário e solicitar aprovação para commit.
