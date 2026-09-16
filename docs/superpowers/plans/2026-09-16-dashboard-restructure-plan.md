# Dashboard Restructuring & Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the dashboard UI by unifying creation and list views on the home screen, remove unused routes, and introduce robust pagination/search for the "Meus Vídeos" page using URL parameters and Prisma.

**Architecture:** Use URL `searchParams` for server-side Next.js fetching. Extend `UploadedFileRepository` to support paginated queries directly from Prisma. Update components to be stacked and remove old files.

**Tech Stack:** Next.js (App Router), Prisma, Shadcn UI

**Spec:** `docs/superpowers/specs/2026-09-16-dashboard-restructure-design.md`

## Global Constraints

- **Testing**: All use cases and core logic must have unit tests passing in Vitest.
- **Commits**: Follow conventional commits (`feat:`, `test:`, `refactor:`).
- **Rule**: NEVER run `git commit` or `git push` sem a autorização explícita do usuário. Apenas modifique os arquivos e teste.

---

### Task 1: UploadedFileRepository Pagination Interface & Implementations

**Files:**
- Modify: `src/domain/ports/uploaded-file-repository.ts`
- Modify: `src/infrastructure/database/repositories/prisma-uploaded-file.repository.ts`
- Modify: `tests/mocks/in-memory-uploaded-file-repository.ts`

**Interfaces:**
- Produces: `PaginationParams`, `PaginatedResult<T>`
- Produces: `findPaginatedByUserId(userId: string, params: PaginationParams): Promise<PaginatedResult<UploadedFileEntity & { clipsCount: number }>>`

- [ ] **Step 1: Update repository port interface**
Add `PaginationParams`, `PaginatedResult<T>` and the new method signature `findPaginatedByUserId(userId: string, params: PaginationParams): Promise<PaginatedResult<UploadedFileEntity & { clipsCount: number }>>` to `src/domain/ports/uploaded-file-repository.ts`.

- [ ] **Step 2: Implement Prisma method**
In `src/infrastructure/database/repositories/prisma-uploaded-file.repository.ts`, implement `findPaginatedByUserId`. Use `limit` and `page` to calculate `skip` and `take`. Use `search` for `displayName { contains: search, mode: "insensitive" }` and `sort` for `orderBy`. Return the `data` joined with `_count: { clips: true }` mapped to `clipsCount`, and also `totalCount` and `totalPages`.

- [ ] **Step 3: Update mock repository**
In `tests/mocks/in-memory-uploaded-file-repository.ts`, implement `findPaginatedByUserId` performing array slicing and filtering so tests pass.

- [ ] **Step 4: Verify with TypeScript compiler**
Run: `npm run check`
Expected: PASS or related missing implementations which are expected to be fixed.

---

### Task 2: Create ListUserVideos Use Case

**Files:**
- Create: `src/application/use-cases/videos/list-user-videos.use-case.ts`
- Create: `tests/unit/application/videos/list-user-videos.use-case.test.ts`

**Interfaces:**
- Consumes: `IUploadedFileRepository.findPaginatedByUserId`
- Produces: `ListUserVideosUseCase.execute(input: { userId: string, page?: number, limit?: number, search?: string, sort?: 'asc' | 'desc' })`

- [ ] **Step 1: Write failing test**
Create `tests/unit/application/videos/list-user-videos.use-case.test.ts` and test that it fetches paginated results with correct mapped DTO properties.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm run test tests/unit/application/videos/list-user-videos.use-case.test.ts`
Expected: FAIL 

- [ ] **Step 3: Implement use case**
Create `src/application/use-cases/videos/list-user-videos.use-case.ts`. Call the repository and map the result to the DTO expected by the UI `UploadedFileDTO` containing `id, s3Key, filename, status, clipsCount, createdAt`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm run test tests/unit/application/videos/list-user-videos.use-case.test.ts`
Expected: PASS

---

### Task 3: Refactor Dashboard Home & Navigation Cleanup

**Files:**
- Modify: `src/app/dashboard/page.tsx`
- Modify: `src/navigation/sidebar/sidebar-items.ts`
- Modify: `src/components/dashboard/sidebar/nav-main.tsx`
- Delete: `src/app/dashboard/create/`
- Delete: `src/app/dashboard/clips/`

**Interfaces:**
- Consumes: `ListUserVideosUseCase`, `CreateProjectClient`, `RecentVideosClient`, `getProcessingOptions`.

- [ ] **Step 1: Clean up navigation**
In `src/navigation/sidebar/sidebar-items.ts`, remove "Novo Projeto" and "Meus Cortes". In `src/components/dashboard/sidebar/nav-main.tsx`, remove the "Quick Create" button/tooltip block.

- [ ] **Step 2: Delete old routes**
Run `rm -rf src/app/dashboard/create src/app/dashboard/clips`.

- [ ] **Step 3: Refactor dashboard home**
Update `src/app/dashboard/page.tsx`. Fetch user credits and processing options. Fetch recent videos by calling `listUserVideosUseCase.execute({ userId, limit: 5 })`.
Render a stacked layout:
```tsx
return (
  <div className="space-y-8">
    <CreateProjectClient userCredits={credits} options={options} />
    <hr className="border-[var(--linha)]" />
    <div>
      <h2 className="text-xl font-semibold mb-4 text-[var(--marfim)]">Acessados Recentemente</h2>
      <RecentVideosClient uploadedFiles={videos.data} />
    </div>
  </div>
);
```

- [ ] **Step 4: Verify build**
Run: `npm run build`
Expected: PASS (No broken links in sidebar or old routes).

---

### Task 4: Refactor Videos Page with Pagination UI

**Files:**
- Modify: `src/app/dashboard/videos/page.tsx`

**Interfaces:**
- Consumes: `ListUserVideosUseCase`, Shadcn UI `Input`, `Select`, `Pagination`

- [ ] **Step 1: Implement Server Component Params**
Update `VideosPage` to accept `searchParams` via props. Read `page` (default 1), `search` (default ""), and `sort` (default "desc"). Pass them to `ListUserVideosUseCase.execute()`.

- [ ] **Step 2: Implement Filter Toolbar**
Create a new client component `src/components/dashboard/videos-toolbar.tsx` (or build directly in the page if easy) that includes an `Input` for search with debounce, and a `Select` for `createdAt` sort direction. Use `useRouter` and `useSearchParams` to push URL updates (e.g., `?search=corte&sort=desc`).

- [ ] **Step 3: Implement Pagination UI**
At the bottom of `src/app/dashboard/videos/page.tsx`, import Shadcn `<Pagination>`, `<PaginationContent>`, `<PaginationItem>`, `<PaginationLink>` etc., and render them based on `result.totalPages` and `result.currentPage`. Clicking a page updates the `?page=X` in the URL.

- [ ] **Step 4: Verify with TypeScript compiler and build**
Run: `npm run check` and `npm run build`.
Expected: PASS.
