# Spec: Reestruturação do Dashboard e Paginação
Date: 2026-09-16

## Contexto e Objetivo
Simplificar a interface do usuário unificando a experiência de criação e visualização inicial, e introduzindo suporte completo a paginação, busca e filtro na listagem completa de vídeos. Páginas redundantes e opções de navegação sem uso serão removidas.

## Modificações na UI e UX

1. **Remoções (Cleanup):**
   - Rota `/dashboard/create` deletada.
   - Rota `/dashboard/clips` deletada.
   - Navegação: Remover botões "Novo Projeto", "Meus Cortes", e "Quick Create" (tooltip e link no sidebar).

2. **Nova Tela Inicial (`/dashboard/page.tsx`):**
   - **Layout Empilhado:**
     - Topo: `CreateProjectClient` - Foco principal da tela, permite fazer upload ou colar URL.
     - Separador Horizontal.
     - Base: `RecentVideosClient` renomeado internamente ou ajustado com título "Acessados Recentemente".
     - Restrição: A lista recente terá um limite fixo de 5 itens e usará um `ScrollArea` se o conteúdo exceder a altura desejada.

3. **Tela de Meus Vídeos (`/dashboard/videos/page.tsx`):**
   - **Controles (Toolbar):** 
     - Input de Busca por nome do vídeo.
     - Select de Ordenação (`createdAt` crescente/decrescente).
   - **Paginação:**
     - Componente de paginação tradicional (ex: 1, 2, 3...) ao final da lista.
     - Usar a UI de paginação do Shadcn.
   - **Estado via URL:**
     - Alterações na busca/ordenação e página refletem imediatamente nos `searchParams` da URL (ex: `?page=2&search=teste&sort=desc`).

## Backend e Data Fetching

1. **Repositório (`UploadedFileRepository`):**
   - Adicionar interface de paginação:
     ```typescript
     interface PaginationParams {
       page: number;
       limit: number;
       search?: string;
       sort?: 'asc' | 'desc';
     }
     
     interface PaginatedResult<T> {
       data: T[];
       totalCount: number;
       totalPages: number;
       currentPage: number;
     }
     ```
   - O `findByUserId` ou novo método similar implementará esses parâmetros usando `skip` e `take` no Prisma, mais os devidos filtros de `where` (`title { contains: search, mode: 'insensitive' }`).

2. **Caso de Uso:**
   - Atualizar a integração de visualização de vídeos do usuário para orquestrar e retornar o `PaginatedResult` mantendo os princípios DDD.

## Riscos e Considerações
- O componente `CreateProjectClient` e `RecentVideosClient` devem poder coexistir na mesma página sem conflitos de estado global.
- A busca deve ter `debounce` no frontend para não sobrecarregar requisições nem o histórico de navegação ao digitar a cada caractere.
