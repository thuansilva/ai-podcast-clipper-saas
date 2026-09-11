# AI Podcast Clipper Pro — Plano de Implementação & Testes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **User Rule Enforced:** NUNCA execute `git commit`, `git push` ou crie tags sem a autorização explícita do usuário. As alterações devem ser preparadas no working directory e revisadas.

**Goal:** Refatorar as funcionalidades do frontend e backend do AI Podcast Clipper Pro seguindo boas práticas de desenvolvimento (SOLID, Clean Architecture, DRY, TDD), fundamentando o sistema em regras de negócio sólidas e cobrindo todas as camadas com testes unitários e de integração.

**Architecture:** Arquitetura limpa e desacoplada dividida em serviços especializados: gerenciamento atômico de créditos (`CreditService`), ingestão de mídia (`VideoIngestionService`), orquestração assíncrona orientada a eventos (`Inngest`), pipeline de visão computacional e IA em containers serverless (`Modal CPU & GPU`), e interface reativa Next.js 15 App Router.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Testing Library, Prisma ORM, PostgreSQL, Inngest, AWS S3 SDK v3, Python 3.12, Pytest, Pydantic, WhisperX, Google GenAI SDK (Gemini 2.5 Flash), OpenCV, ffmpegcv, pysubs2, yt-dlp, Stripe.

**Spec:** `docs/superpowers/specs/2026-09-10-ai-podcast-clipper-pro-design.md`

---

## 1. Mapeamento das Regras de Negócio (Base Sólida)

| ID | Nome da Regra | Camada | Descrição & Critério de Aceite |
| :--- | :--- | :---: | :--- |
| **RN-01** | **Cálculo de Custo de Vídeo** | Core / Domínio | O custo de processamento é fixado em `ceil(duration_seconds / 60)` créditos. Mínimo de 1 crédito. |
| **RN-02** | **Reserva Atômica (Hold)** | Banco / Prisma | Antes de iniciar o processamento, o sistema retém os créditos necessários em `user.reservedCredits` e decrementa de `user.credits` em transação atômica. Se `credits < required`, a operação é abortada com erro amigável. |
| **RN-03** | **Estorno Garantido (Refund)** | Filas / Inngest | Se qualquer etapa do processamento falhar ou for cancelada, 100% dos créditos em `reservedCredits` são estornados para `user.credits` e uma transação `REFUND` é registrada. |
| **RN-04** | **Consumo Efetivo (Consume)** | Filas / Inngest | Somente após a persistência bem-sucedida de todos os clipes gerados, a reserva é consolidada (`reservedCredits` é zerado) e uma transação `CONSUME` é criada. |
| **RN-05** | **Isolamento de Concorrência** | Orquestração | Cada usuário pode ter no máximo 1 vídeo em processamento ativo simultaneamente (`concurrency.limit: 1, key: event.data.userId`). |
| **RN-06** | **Ingestão Dupla Válida** | Ingestão | O sistema aceita uploads locais de vídeos (`.mp4`, `.mov`, máx 500MB) via Presigned URL S3 ou URLs válidas do YouTube (`youtube.com` ou `youtu.be`). Vídeos privados ou com restrição são rejeitados antes da reserva. |
| **RN-07** | **Contrato Estrito da IA** | Backend IA | O Gemini 2.5 Flash deve responder exclusivamente em formato JSON validado por schema Pydantic (`MomentsExtraction`). Clipes devem ter entre 30s e 60s, sem sobreposição temporal e com notas de viralidade de 1 a 10. |
| **RN-08** | **Active Speaker Detection por Trecho** | Backend IA | O algoritmo LR-ASD é executado **apenas** nos intervalos de tempo dos clipes selecionados pelo Gemini, gerando recorte vertical 9:16 ou fallback com fundo desfocado se o score for negativo. |
| **RN-09** | **Presets de Legenda Dinâmicos** | Renderização | As legendas devem ser geradas em blocos de palavras com sincronia fonética e estilização configurável (`HORMOZI`, `MINIMAL`, `NEON`). |
| **RN-10** | **Governança e Limpeza S3** | Storage | Arquivos brutos de vídeo (`original.mp4`) têm TTL de expiração automática. A exclusão de clipes pelo usuário aciona `DeleteObjectCommand` imediato no bucket. |

---

## 2. Estrutura de Arquivos a Criar e Refatorar

```
ai-podcast-clipper-frontend/
├── vitest.config.ts                      # Configuração do Vitest
├── src/
│   ├── lib/
│   │   ├── credits.ts                    # RN-01: Cálculo de créditos e formatação
│   │   └── youtube.ts                    # RN-06: Validação e extração de ID do YouTube
│   ├── server/
│   │   ├── services/
│   │   │   ├── credit-service.ts         # RN-02, RN-03, RN-04: Transações atômicas
│   │   │   ├── s3-service.ts             # RN-06, RN-10: Presigned URLs e exclusão
│   │   │   └── video-service.ts          # Gestão de UploadedFile e status
│   ├── inngest/
│   │   └── functions.ts                  # RN-03, RN-04, RN-05: Orquestrador resiliente
│   ├── components/
│   │   ├── import-video-tabs.tsx         # Componente de abas (Upload + YouTube)
│   │   ├── clip-card.tsx                 # Card de clipe com score, hook e player
│   │   └── clip-editor-modal.tsx         # Modal de edição rápida de legendas
└── tests/
    ├── unit/
    │   ├── credits.test.ts
    │   ├── youtube.test.ts
    │   └── auth.test.ts
    └── integration/
        ├── credit-service.test.ts
        ├── s3-service.test.ts
        └── inngest-pipeline.test.ts

ai-podcast-clipper-backend/
├── tests/
│   ├── test_gemini_schema.py             # RN-07: Validação de Pydantic e Gemini
│   ├── test_subtitles.py                 # RN-09: Teste de geração de estilos ASS
│   ├── test_youtube_downloader.py        # RN-06: Teste de extração yt-dlp
│   └── test_api_endpoints.py             # Contrato do endpoint FastAPI
├── core/
│   ├── schemas.py                        # Modelos Pydantic de entrada e saída
│   ├── subtitle_styles.py                # Gerador de estilos de legendas
│   └── youtube_downloader.py             # Worker de download em CPU
└── main.py                               # Pipeline refatorado
```

---

## 3. Tarefas de Implementação (Bite-Sized & TDD)

### Task 1: Setup do Ambiente de Testes & Validação das Regras Básicas (Frontend)

**Files:**
- Create: `ai-podcast-clipper-frontend/vitest.config.ts`
- Create: `ai-podcast-clipper-frontend/src/lib/credits.ts`
- Create: `ai-podcast-clipper-frontend/src/lib/youtube.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/credits.test.ts`
- Test: `ai-podcast-clipper-frontend/tests/unit/youtube.test.ts`

**Interfaces:**
- Produces: `calculateVideoCredits(durationSeconds: number): number`
- Produces: `isValidYouTubeUrl(url: string): boolean`
- Produces: `extractYouTubeVideoId(url: string): string | null`

- [ ] **Step 1: Instalar Vitest e dependências de teste**
```bash
cd ai-podcast-clipper-frontend && npm i -D vitest @vitejs/plugin-react jsdom --legacy-peer-deps
```

- [ ] **Step 2: Configurar `vitest.config.ts`**
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Escrever os testes unitários falhando (RED) para RN-01 e RN-06**
Criar `tests/unit/credits.test.ts` e `tests/unit/youtube.test.ts`:
```ts
// tests/unit/credits.test.ts
import { describe, it, expect } from "vitest";
import { calculateVideoCredits } from "~/lib/credits";

describe("RN-01: Cálculo de Créditos por Duração", () => {
  it("deve cobrar 1 crédito para vídeos de até 60 segundos", () => {
    expect(calculateVideoCredits(30)).toBe(1);
    expect(calculateVideoCredits(60)).toBe(1);
  });
  it("deve arredondar para cima minutos fracionados (ceil)", () => {
    expect(calculateVideoCredits(61)).toBe(2);
    expect(calculateVideoCredits(120)).toBe(2);
    expect(calculateVideoCredits(121)).toBe(3);
  });
  it("deve retornar 1 crédito como piso mínimo para durações <= 0", () => {
    expect(calculateVideoCredits(0)).toBe(1);
  });
});
```
```ts
// tests/unit/youtube.test.ts
import { describe, it, expect } from "vitest";
import { isValidYouTubeUrl, extractYouTubeVideoId } from "~/lib/youtube";

describe("RN-06: Validação de URLs do YouTube", () => {
  it("deve validar URLs padrão do YouTube", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });
  it("deve invalidar URLs não pertencentes ao YouTube", () => {
    expect(isValidYouTubeUrl("https://vimeo.com/123456")).toBe(false);
    expect(isValidYouTubeUrl("texto aleatório")).toBe(false);
  });
  it("deve extrair o ID do vídeo corretamente", () => {
    expect(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
});
```

- [ ] **Step 4: Rodar o teste para verificar falha (RED)**
```bash
cd ai-podcast-clipper-frontend && npx vitest run tests/unit/credits.test.ts tests/unit/youtube.test.ts
```
Esperado: FAIL (módulos não encontrados).

- [ ] **Step 5: Implementar o código mínimo para passar (GREEN)**
Criar `src/lib/credits.ts` e `src/lib/youtube.ts`.

- [ ] **Step 6: Rodar os testes e verificar sucesso (GREEN)**
```bash
cd ai-podcast-clipper-frontend && npx vitest run tests/unit/credits.test.ts tests/unit/youtube.test.ts
```
Esperado: PASS.

---

### Task 2: Refatoração do Banco e Transações Atômicas de Crédito (`CreditService`)

**Files:**
- Modify: `ai-podcast-clipper-frontend/prisma/schema.prisma`
- Create: `ai-podcast-clipper-frontend/src/server/services/credit-service.ts`
- Test: `ai-podcast-clipper-frontend/tests/integration/credit-service.test.ts`

**Interfaces:**
- Produces: `CreditService.holdCredits(userId: string, durationSeconds: number, fileId: string): Promise<{ success: boolean; held: number }>`
- Produces: `CreditService.consumeCredits(userId: string, amount: number, fileId: string): Promise<void>`
- Produces: `CreditService.refundCredits(userId: string, amount: number, fileId: string, reason: string): Promise<void>`

- [ ] **Step 1: Atualizar o schema do Prisma**
Adicionar `reservedCredits` em `User`, modelo `CreditTransaction`, e novos campos em `UploadedFile` e `Clip`.
- [ ] **Step 2: Sincronizar com o banco local**
```bash
cd ai-podcast-clipper-frontend && npx prisma db push
```
- [ ] **Step 3: Escrever os testes de integração do `CreditService` (RED)**
Testar:
1. `holdCredits` debitando saldo e incrementando `reservedCredits`.
2. `holdCredits` rejeitando quando saldo é insuficiente.
3. `consumeCredits` debitando de `reservedCredits` sem alterar `credits`.
4. `refundCredits` devolvendo `reservedCredits` de volta para `credits`.
- [ ] **Step 4: Executar os testes para confirmar falha (RED)**
- [ ] **Step 5: Implementar `CreditService` com transações Prisma `$transaction`**
- [ ] **Step 6: Executar os testes para confirmar sucesso (GREEN)**

---

### Task 3: Backend Python — Gemini com Structured Outputs e Presets de Legenda

**Files:**
- Create: `ai-podcast-clipper-backend/core/schemas.py`
- Create: `ai-podcast-clipper-backend/core/subtitle_styles.py`
- Modify: `ai-podcast-clipper-backend/main.py`
- Test: `ai-podcast-clipper-backend/tests/test_gemini_schema.py`
- Test: `ai-podcast-clipper-backend/tests/test_subtitles.py`

**Interfaces:**
- Produces: `ClipItem(BaseModel)`
- Produces: `MomentsExtraction(BaseModel)`
- Produces: `generate_ass_subtitles(segments, preset, output_path)`

- [ ] **Step 1: Configurar ambiente de testes Pytest no backend**
```bash
python3 -m pip install pytest pytest-mock pydantic pysubs2
```
- [ ] **Step 2: Escrever testes unitários para schemas Pydantic e geração de estilos ASS (RED)**
Validar que `MomentsExtraction` rejeita clipes com timestamps inválidos (`start >= end` ou `duration > 60`).
Validar que `generate_ass_subtitles` gera estilos com fonte Anton (`HORMOZI`) e fontes sans-serif (`MINIMAL`).
- [ ] **Step 3: Executar `pytest` para confirmar falha (RED)**
- [ ] **Step 4: Implementar `schemas.py` e `subtitle_styles.py`**
- [ ] **Step 5: Integrar no `main.py` com o SDK oficial `google-genai` usando `response_schema=MomentsExtraction`**
- [ ] **Step 6: Executar `pytest` para confirmar sucesso (GREEN)**

---

### Task 4: Ingestão de Vídeos do YouTube (yt-dlp em CPU Worker)

**Files:**
- Create: `ai-podcast-clipper-backend/core/youtube_downloader.py`
- Test: `ai-podcast-clipper-backend/tests/test_youtube_downloader.py`

**Interfaces:**
- Produces: `get_youtube_video_info(url: string) -> dict[str, Any]`
- Produces: `download_youtube_to_s3(url: string, s3_bucket: string, s3_key: string) -> int`

- [ ] **Step 1: Instalar `yt-dlp` e dependências**
```bash
python3 -m pip install yt-dlp boto3
```
- [ ] **Step 2: Escrever testes unitários com mocks de extração de metadados do YouTube (RED)**
Testar extração de título, duração em segundos e bloqueio de vídeos com restrição.
- [ ] **Step 3: Executar `pytest tests/test_youtube_downloader.py` (RED)**
- [ ] **Step 4: Implementar `youtube_downloader.py` utilizando `yt-dlp.YoutubeDL` com streaming para S3 via boto3**
- [ ] **Step 5: Executar `pytest tests/test_youtube_downloader.py` (GREEN)**

---

### Task 5: Orquestrador Inngest Resiliente com Estorno Automático

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/inngest/functions.ts`
- Test: `ai-podcast-clipper-frontend/tests/integration/inngest-pipeline.test.ts`

**Interfaces:**
- Consumes: `CreditService.holdCredits`, `CreditService.consumeCredits`, `CreditService.refundCredits`
- Produces: `processVideo` Inngest Function com steps rastreados

- [ ] **Step 1: Escrever teste de integração do pipeline Inngest (RED)**
Simular um job completo com sucesso e outro com falha no Modal, verificando que o estorno é acionado via `onFailure`.
- [ ] **Step 2: Executar testes para confirmar falha (RED)**
- [ ] **Step 3: Refatorar `functions.ts`**:
  - `step.run("reserve-credits")`
  - `step.run("ingest-youtube-if-needed")`
  - `step.fetch("call-modal-gpu")`
  - `step.run("persist-clips-and-consume")`
  - Tratamento `onFailure` com estorno atômico.
- [ ] **Step 4: Executar testes para confirmar sucesso (GREEN)**

---

### Task 6: Frontend — Importador Duplo (Upload MP4 + Link do YouTube)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/components/import-video-tabs.tsx`
- Modify: `ai-podcast-clipper-frontend/src/components/dashboard-client.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/import-video-tabs.test.tsx`

**Interfaces:**
- Consumes: `calculateVideoCredits`, `isValidYouTubeUrl`
- Produces: Componente com visualização prévia de custo de créditos e submissão validada.

- [ ] **Step 1: Escrever teste do componente de importação (RED)**
Testar alternância entre as abas "Upload MP4" e "Link do YouTube".
Validar que botão de submissão fica desabilitado se saldo for menor que o custo exibido.
- [ ] **Step 2: Executar teste (RED)**
- [ ] **Step 3: Implementar `import-video-tabs.tsx` com componentes Shadcn UI (Tabs, Input, Button, Card, Badge)**
- [ ] **Step 4: Integrar no `dashboard-client.tsx`**
- [ ] **Step 5: Executar teste (GREEN)**

---

### Task 7: Frontend — Polling Reativo e Studio de Clipes com Presets

**Files:**
- Create: `ai-podcast-clipper-frontend/src/components/clip-card.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/clip-editor-modal.tsx`
- Modify: `ai-podcast-clipper-frontend/src/components/dashboard-client.tsx`
- Test: `ai-podcast-clipper-frontend/tests/unit/clip-card.test.tsx`

**Interfaces:**
- Produces: `ClipCard` com reprodução 9:16, badge de virality score, cópia do hook e botão de download.
- Produces: `ClipEditorModal` permitindo editar o texto da transcrição e trocar presets de legenda.

- [ ] **Step 1: Escrever teste de renderização do `ClipCard` (RED)**
- [ ] **Step 2: Executar teste (RED)**
- [ ] **Step 3: Implementar `clip-card.tsx` e `clip-editor-modal.tsx`**
- [ ] **Step 4: Adicionar polling automático a cada 4 segundos no `dashboard-client.tsx` enquanto status for `PROCESSING` ou `DOWNLOADING`**
- [ ] **Step 5: Executar teste (GREEN)**

---

### Task 8: Verificação Ponta a Ponta e Homologação Final

**Files:**
- All tests across frontend and backend

- [ ] **Step 1: Executar suite completa de testes no frontend**
```bash
cd ai-podcast-clipper-frontend && npm run typecheck && npx vitest run
```
Esperado: 100% de aprovação.

- [ ] **Step 2: Executar suite completa de testes no backend**
```bash
cd ai-podcast-clipper-backend && pytest -v
```
Esperado: 100% de aprovação.

- [ ] **Step 3: Validação do fluxo integrado manual**
Submeter link do YouTube de teste e upload local, monitorando transações de crédito e geração no Inngest.

- [ ] **Step 4: Apresentar resumo de mudanças e solicitar aprovação para commit**
Conforme a diretriz do projeto, exibir o diff completo e aguardar comando explícito do usuário antes de comitar.
