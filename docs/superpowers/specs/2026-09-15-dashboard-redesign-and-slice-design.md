# Especificação de Design: Redesign do Dashboard & Fluxo de Slicing (Cortes Específicos)

- **Data:** 15 de Setembro de 2026
- **Status:** Aguardando Revisão do Usuário
- **Módulo:** Dashboard UI, Backend Metadata API, Sistema de Créditos Variáveis
- **Arquitetura:** Clean Architecture / Dark Precision Studio Design System

---

## 1. Visão Geral e Objetivos

O objetivo desta especificação é redesenhar completamente a experiência interna do usuário (Painel/Dashboard), abandonando o sistema de abas e adotando um modelo profissional com Menu Lateral (Sidebar). 

Junto a isso, alteramos o núcleo do consumo de créditos: usuários agora poderão selecionar trechos específicos (Slices) de um vídeo do YouTube antes de processá-lo, sendo cobrados proporcionalmente ao tempo selecionado, otimizando o gasto do usuário e os recursos do sistema.

---

## 2. Refatoração de Interface (Layout & Navegação)

### 2.1. Novo Layout Base (`SidebarLayout`)
- O `NavHeader` de topo será removido.
- A aplicação passa a ter um **Menu Lateral Fixo** com as seguintes rotas:
  - `/dashboard`: Visão Geral (Home / Status Recentes).
  - `/dashboard/create`: Novo Projeto (Onde a mágica acontece).
  - `/dashboard/videos`: Meus Vídeos (Histórico de uploads e processamentos).
  - `/dashboard/clips`: Meus Cortes (Galeria de clipes já renderizados).
  - `/dashboard/billing`: Faturamento & Assinatura.

### 2.2. O Dashboard Principal (`/dashboard`)
- Apresentará os "Últimos Vídeos".
- **Visual de Processamento:** Quando um vídeo estiver em andamento, ele não será apenas uma linha de texto. Ele aparecerá como um **Card com a Thumbnail do vídeo**. A imagem terá um efeito de desfoque (`blur`) acompanhado de um selo central de 1 palavra com o status atual (ex: `PROCESSANDO...`, `FILA`, `FALHA`).

---

## 3. Fluxo "Novo Projeto" (`/dashboard/create`)

A experiência de criação será dividida nos seguintes estágios interativos na mesma tela:

1. **Input de URL:** O usuário cola o link do YouTube.
2. **Preview e Slicing:** O sistema carrega a Thumbnail e exibe um **Range Slider duplo** (Início e Fim). O usuário seleciona o intervalo desejado (ex: `03:00` a `05:00`).
3. **Cálculo de Custo:** A interface atualiza em tempo real a mensagem de custo (ex: *"Custo: 2 Créditos"*).
4. **Seleção de Estilo Visual:** O usuário escolhe o estilo da legenda. A seleção não será um mero `select`, mas sim **Cards Visuais (Templates)** mostrando exatamente como as legendas irão ficar na tela.
5. **Ação:** Botão "Processar Corte".

---

## 4. Alterações de Backend e Regras de Negócio

### 4.1. Nova API de Metadados (`GetYoutubeVideoMetadataUseCase`)
- Criaremos um endpoint leve (ex: `GET /api/videos/info?url=...`).
- O endpoint irá extrair o `title`, `thumbnail` e, crucialmente, a `duration` (em segundos) real do vídeo para preencher a interface antes do processamento.

### 4.2. Alteração na Precificação de Créditos
- A tabela `UploadedFile` ou a lógica de payload de processamento passará a armazenar `startTime` e `endTime`.
- O caso de uso `TriggerVideoProcessingUseCase` será modificado. Em vez de deduzir 1 crédito fixo, ele calculará:
  ```typescript
  const durationSeconds = endTime - startTime;
  const minutes = Math.ceil(durationSeconds / 60);
  const creditCost = minutes; // 1 crédito por minuto fatiado
  ```
- O sistema bloqueará o processamento caso o usuário não tenha saldo suficiente para o trecho fatiado.
- *Nota: Clientes do plano Starter que excederem o limite de 15 minutos serão bloqueados caso a validação exija.*

---

## 5. Próximos Passos (Plano de Ação)
Após a aprovação desta Spec, um Plano de Implementação detalhado será gerado cobrindo as atualizações do Prisma Schema, criação do layout e refatoração das páginas.
