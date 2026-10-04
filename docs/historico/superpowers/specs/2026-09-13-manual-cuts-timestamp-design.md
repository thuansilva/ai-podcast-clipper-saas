# Especificação de Design: Cortes Manuais por Timestamps (Manual Clips)

- **Data:** 2026-09-13
- **Status:** Aprovado em Brainstorming
- **Autor:** Antigravity / DeepMind Pair Programming
- **Alvo:** `ai-podcast-clipper-frontend` & `ai-podcast-clipper-backend`

---

## 1. Visão Geral e Objetivos

Atualmente, o **AI Podcast Clipper SaaS** opera exclusivamente no modo **Auto IA**: o usuário envia um vídeo completo ou link do YouTube, o WhisperX transcreve o episódio todo e o Google Gemini analisa a narrativa para escolher automaticamente até 5 momentos virais.

Esta especificação introduz o **Modo de Corte Manual Preciso**:
O usuário pode definir os intervalos exatos de tempo que deseja cortar (início e fim) com atalhos rápidos de duração (`+25s`, `+30s`, `+60s`) e pré-visualização no player de vídeo. A inteligência artificial ainda executa o **Active Speaker Detection (enquadramento 9:16 vertical focado no orador ativo)** e a geração de **legendas dinâmicas sincronizadas** (estilo Alex Hormozi), mas sem a necessidade de gastar tempo ou tokens do Gemini procurando momentos virais pelo vídeo inteiro.

Além disso, a cobrança de créditos é **proporcional apenas aos cortes gerados** (ex: 2 cortes de 30s debitam apenas 2 créditos, mesmo que o vídeo original no YouTube tenha 2 horas).

---

## 2. Requisitos de Usuário e Casos de Uso

### UC-01: Escolha do Modo de Processamento
- No formulário de importação ([`ImportVideoTabs`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/components/import-video-tabs.tsx)), o usuário pode alternar entre:
  - **`Auto IA (Recomendado)`**: Comportamento padrão atual. O Gemini vasculha o vídeo completo.
  - **`Corte Manual Preciso`**: Permite definir um ou múltiplos intervalos de corte com início e fim.

### UC-02: Definição de Início e Fim com Atalhos Rápidos
- O usuário insere o tempo de início no formato `MM:SS` (ou `HH:MM:SS`).
- Ao clicar nos chips de atalho rápido (`+25s`, `+30s`, `+60s`), o tempo de fim é preenchido automaticamente somando os segundos selecionados ao tempo de início:
  - Exemplo: Início `01:15` + clique em `+30s` → Fim preenchido como `01:45`.
- O usuário também pode digitar o tempo de fim manualmente.

### UC-03: Múltiplos Cortes Manuais por Envio
- A interface inicia com 1 bloco de corte e possui o botão `+ Adicionar Corte`.
- O usuário pode adicionar quantos cortes desejar do mesmo vídeo (ex: Corte 1: `02:00` a `02:30`, Corte 2: `15:10` a `15:50`).
- Cada corte possui um botão de remoção (ativo quando houver 2 ou mais cortes).

### UC-04: Captura de Tempo Atual pelo Player de Vídeo (Upload Local)
- No envio de arquivo local (`.mp4`, `.mov`), o componente exibe um mini-player de vídeo.
- Cada bloco de corte contém o botão `Marcar tempo atual`, que preenche o campo de Início com o timestamp exato onde o vídeo está pausado no player.

### UC-05: Economia e Cobrança Justa de Créditos
- No modo `Auto IA`: Os créditos continuam sendo cobrados pela duração total do vídeo (`calculateVideoCredits(durationSeconds)`).
- No modo `Corte Manual`: O custo em créditos é a soma dos minutos dos cortes solicitados:
  - Cada corte de até 60 segundos consome **1 crédito**.
  - Dois cortes de 30 segundos consomem **2 créditos** no total, mesmo se o vídeo original tiver 120 minutos.

---

## 3. Arquitetura e Estrutura de Componentes

### 3.1 Camada de Domínio (Pure Business Logic)

#### `src/domain/rules/timestamp-parser.ts`
Funções puras sem dependências externas:
```typescript
/**
 * Converte string formatada MM:SS ou HH:MM:SS para segundos inteiros.
 * Exemplos:
 *  "00:30" -> 30
 *  "01:15" -> 75
 *  "01:02:15" -> 3735
 */
export function parseTimestampToSeconds(value: string): number | null;

/**
 * Converte segundos inteiros para string no formato MM:SS (ou HH:MM:SS se >= 1 hora).
 * Exemplos:
 *  75 -> "01:15"
 *  3735 -> "01:02:15"
 */
export function formatSecondsToTimestamp(seconds: number): string;

/**
 * Soma segundos a uma string de tempo e retorna a nova string formatada.
 * Exemplo: addSecondsToTimestamp("01:15", 30) -> "01:45"
 */
export function addSecondsToTimestamp(currentTimestamp: string, deltaSeconds: number): string;

/**
 * Valida se um corte manual é válido.
 */
export function validateManualCut(
  startSeconds: number,
  endSeconds: number,
  maxVideoDuration?: number
): { valid: boolean; error?: string };
```

#### `src/domain/rules/calculate-credits.ts`
Nova função de domínio:
```typescript
export interface ManualCutDurationItem {
  startTime: number;
  endTime: number;
}

/**
 * Calcula créditos consumidos por cortes manuais.
 * Cada fração de até 60 segundos de cada corte consome 1 crédito.
 */
export function calculateManualCutsCredits(cuts: ManualCutDurationItem[]): number {
  if (!cuts || cuts.length === 0) return 0;
  return cuts.reduce((total, cut) => {
    const duration = Math.max(0, cut.endTime - cut.startTime);
    const creditsForCut = Math.max(1, Math.ceil(duration / 60));
    return total + creditsForCut;
  }, 0);
}
```

---

### 3.2 DTOs e Contratos de Aplicação

#### `src/application/dtos/video-dtos.ts`
```typescript
export interface ManualCutDTO {
  id?: string;
  title?: string;
  startTime: number; // em segundos
  endTime: number;   // em segundos
}

export type ProcessingMode = "auto" | "manual";

export interface ImportYouTubeVideoInput {
  userId: string;
  url: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}

export interface ProcessVideoEventData {
  uploadedFileId: string;
  userId?: string;
  preset?: string;
  mode?: ProcessingMode;
  manualCuts?: ManualCutDTO[];
}
```

---

### 3.3 Interface de Usuário ([`ImportVideoTabs`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/components/import-video-tabs.tsx))

- **Controle de Estado:**
  - `mode: "auto" | "manual"` (padrão `"auto"`).
  - `manualCuts: Array<{ id: string; title: string; start: string; end: string }>` (inicia com 1 item: `{ id: "1", title: "", start: "00:00", end: "00:30" }`).
- **Botões Rápidos:**
  - `+25s`: `setEnd(addSecondsToTimestamp(cut.start, 25))`
  - `+30s`: `setEnd(addSecondsToTimestamp(cut.start, 30))`
  - `+60s`: `setEnd(addSecondsToTimestamp(cut.start, 60))`
- **Player de Pré-visualização:**
  - Renderiza elemento `<video>` HTML5 referenciando `URL.createObjectURL(file)`.
  - Botão `"Marcar tempo atual"` lê `videoRef.current.currentTime`, formata para `MM:SS` e atualiza o campo `start` do corte ativo.
- **Badge de Créditos:**
  - Se `mode === "manual"`: calcula `calculateManualCutsCredits(...)`. Exibe: `Custo: X créditos (Y cortes manuais)`.
  - Se `mode === "auto"`: calcula `calculateVideoCredits(durationSeconds)`.

---

### 3.4 Inngest e Pipeline de Processamento ([`src/inngest/functions.ts`](file:///home/thuan/Documentos/projetos-empresa/ai-podcast-clipper-saas/ai-podcast-clipper-frontend/src/inngest/functions.ts))

- **Passo 1 (`validate-and-reserve-credits`)**:
  - Se `mode === "manual"` e `manualCuts?.length > 0`:
    - Converte os cortes manuais e calcula o custo com `calculateManualCutsCredits`.
    - Executa `holdCreditsUseCase` reservando apenas o valor exato dos cortes manuais.
- **Passo 3 (`call-modal-gpu`)**:
  - Envia payload com `mode: "manual"` e `manual_cuts: [...]` para o endpoint de processamento.
- **Backend Worker (`ai-podcast-clipper-backend/main.py`)**:
  - Se `manual_cuts` for recebido:
    - Pula a etapa de chamar o Google Gemini (`identify_moments`).
    - Para cada corte manual, corta o trecho (`ffmpeg -ss start -t duration`), executa o enquadramento facial 9:16 com `LR-ASD` e gera as legendas animadas alinhadas pelo WhisperX.

---

## 4. Tratamento de Erros e Validações

1. **Validação de Início e Fim**:
   - Se `start >= end`: bloqueia o envio e exibe feedback: *"O tempo final deve ser maior que o tempo inicial"*.
   - Se duração do corte `< 5s`: *"A duração mínima de um corte é de 5 segundos"*.
   - Se duração do corte `> 180s`: *"A duração máxima de um corte manual é de 180 segundos"*.
2. **Saldo Insuficiente**:
   - Desabilita o botão de submissão e alerta se `userCredits < creditosNecessarios`.
3. **Falha na fila ou GPU**:
   - Mantém a rotina de reembolso integral dos créditos reservados via `onFailure` do Inngest.

---

## 5. Estratégia de Testes

1. **`tests/unit/domain/timestamp-parser.test.ts`**:
   - Testar conversões `MM:SS` e `HH:MM:SS` para segundos.
   - Testar conversão de segundos para string formatada.
   - Testar somatório com atalhos rápidos (`+25s`, `+30s`, `+60s`).
   - Testar validações de limites e erros.
2. **`tests/unit/domain/calculate-manual-credits.test.ts`**:
   - Testar 1 corte de 30s = 1 crédito.
   - Testar 2 cortes de 45s = 2 créditos.
   - Testar corte de 70s = 2 créditos.
3. **`tests/unit/import-video-tabs.test.tsx`**:
   - Alternar modo Auto IA e Corte Manual.
   - Adicionar e remover cortes manuais.
   - Testar clique nos botões rápidos `+25s`, `+30s`, `+60s`.
   - Testar cálculo e exibição de créditos no modo manual.
   - Validar envio dos dados na Server Action.
4. **`npm run check` & `npm run test:all`**:
   - 0 erros de TypeScript e todas as suítes Vitest passando sem quebrar funcionalidades anteriores.
