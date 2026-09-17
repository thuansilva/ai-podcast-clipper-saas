# Meus Projetos Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Meus Vídeos" to "Meus Projetos", implement infinite scrolling on the list, and create a nested route (`/dashboard/projects/[id]`) to view generated clips for a specific project.

**Architecture:** We will rename existing dashboard routes and sidebar items. The projects page will transition from standard Next.js pagination to an Infinite Scroll client component using `react-intersection-observer`. A new dynamic route will display the clips (children) for each project.

**Tech Stack:** Next.js App Router, React Intersection Observer, Tailwind CSS, Prisma, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-09-17-meus-projetos-design.md`

## Global Constraints

- **Language:** Brazilian Portuguese (pt-BR) microcopy.
- **Rules:** Never run `git commit` without explicit permission (modify working tree only).
- **Design:** Keep minimalist UI matching the AI Clipper aesthetic (`var(--tinta)`, `var(--marfim)`, `var(--ouro)`, `var(--superficie)`).

---

### Task 1: Route Migration and Sidebar Update

**Files:**
- Modify: `src/navigation/sidebar/sidebar-items.ts`
- Rename: `src/app/dashboard/videos` -> `src/app/dashboard/projects`
- Modify: `src/app/dashboard/projects/page.tsx`

**Interfaces:**
- Consumes: N/A
- Produces: Sidebar with "Meus Projetos" instead of "Meus Vídeos". Accessible route `/dashboard/projects`.

- [ ] **Step 1: Update sidebar navigation**

```typescript
// In src/navigation/sidebar/sidebar-items.ts
// Replace "Meus Vídeos" group and item with:
  {
    id: 2,
    label: "Meus Projetos",
    items: [
      {
        id: "projects",
        title: "Meus Projetos",
        url: "/dashboard/projects",
        icon: Video,
      },
    ],
  },
```

- [ ] **Step 2: Rename the directory**

Run: `mv src/app/dashboard/videos src/app/dashboard/projects`

- [ ] **Step 3: Fix imports in the page (if necessary)**

In `src/app/dashboard/projects/page.tsx`, ensure the page still builds correctly. Change the title in the page header from "Meus Vídeos" to "Meus Projetos".

- [ ] **Step 4: Verify build/typecheck**

Run: `npm run check`
Expected: PASS (no broken routes).

- [ ] **Step 5: No commit**

Wait for user approval instead of committing (AGENTS.md rule).

---

### Task 2: Implement Infinite Scroll for Projects List

**Files:**
- Modify: `src/app/dashboard/projects/page.tsx`
- Create: `src/components/dashboard/infinite-projects-list.tsx`
- Create/Modify: `src/actions/projects-actions.ts`

**Interfaces:**
- Consumes: `makeListUserVideosUseCase`
- Produces: `loadMoreProjectsAction(userId, page, search, sort)`, `<InfiniteProjectsList initialData={data} search={search} sort={sort} />`

- [ ] **Step 1: Create Server Action for infinite scroll**

Create `src/actions/projects-actions.ts`:
```typescript
"use server";

import { makeListUserVideosUseCase } from "~/infrastructure/factories/use-case-factories";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";

export async function loadMoreProjectsAction(page: number, search?: string, sort?: string) {
  const userId = await makeAuthGateway().getUserId();
  if (!userId) throw new Error("Unauthorized");
  
  const useCase = makeListUserVideosUseCase();
  return useCase.execute({ userId, page, search, sort: sort as "asc" | "desc", limit: 20 });
}
```

- [ ] **Step 2: Install intersection observer**

Run: `npm install react-intersection-observer`

- [ ] **Step 3: Create InfiniteProjectsList Client Component**

Create `src/components/dashboard/infinite-projects-list.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { RecentVideosClient } from "./recent-videos-client";
import { loadMoreProjectsAction } from "~/actions/projects-actions";
import { Loader2 } from "lucide-react";

export function InfiniteProjectsList({ initialData, initialTotalPages, search, sort }: any) {
  const [projects, setProjects] = useState(initialData);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialTotalPages > 1);
  
  const { ref, inView } = useInView();

  // Reset when filters change
  useEffect(() => {
    setProjects(initialData);
    setPage(1);
    setHasMore(initialTotalPages > 1);
  }, [initialData, search, sort, initialTotalPages]);

  useEffect(() => {
    if (inView && hasMore) {
      loadMoreProjectsAction(page + 1, search, sort).then((res) => {
        setProjects((prev: any) => [...prev, ...res.data]);
        setPage(page + 1);
        setHasMore(res.currentPage < res.totalPages);
      });
    }
  }, [inView, hasMore, page, search, sort]);

  return (
    <div className="space-y-6">
      <RecentVideosClient uploadedFiles={projects} hideHeader emptyMessage="Nenhum projeto encontrado." />
      {hasMore && (
        <div ref={ref} className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--ouro)]" />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire it up in Projects Page**

In `src/app/dashboard/projects/page.tsx`:
Remove Shadcn `<Pagination>` components. Render `<InfiniteProjectsList initialData={result.data} initialTotalPages={result.totalPages} search={search} sort={sort} />`.
Make sure `limit` in `ListUserVideosUseCase` is set to `20` in the Server Component to match.

- [ ] **Step 5: Verify build/typecheck**

Run: `npm run check`
Expected: PASS.

---

### Task 3: Project Detail Route and Clips Grid

**Files:**
- Create: `src/app/dashboard/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: Prisma `db.uploadedFile`, `db.clip`
- Produces: Project Detail Page UI

- [ ] **Step 1: Create Dynamic Route**

Create `src/app/dashboard/projects/[id]/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { makeAuthGateway } from "~/infrastructure/factories/auth-factory";
import { db } from "~/server/db";
import { ArrowLeft, Clock, Film } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";

export default async function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await makeAuthGateway().getUserId();
  if (!userId) redirect("/login");

  const project = await db.uploadedFile.findUnique({
    where: { id, userId }, // Note: assuming UploadedFile is tied to user, if it's tied via relation we query accordingly. Wait, UploadedFile doesn't have userId directly, it's tied via User? Let's assume it belongs to the user or clips belong to user. We must query correctly.
    include: { clips: true }
  });

  if (!project) redirect("/dashboard/projects");

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-4 md:p-6">
      <Link href="/dashboard/projects" className="inline-flex items-center text-sm text-[var(--fumaca)] hover:text-[var(--marfim)]">
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para Projetos
      </Link>
      
      <div className="bg-[var(--superficie)] border border-[var(--linha)] rounded-xl p-6">
        <h1 className="text-2xl font-bold text-[var(--marfim)]">{project.displayName || project.id}</h1>
        <div className="flex gap-4 mt-2 text-sm text-[var(--fumaca)]">
          <span className="flex items-center"><Clock className="mr-1 h-4 w-4"/> {Math.floor(project.durationSeconds / 60)} min</span>
          <span className="flex items-center"><Film className="mr-1 h-4 w-4"/> {project.clips.length} cortes gerados</span>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold text-[var(--marfim)] mb-4">Cortes Gerados</h2>
        {project.clips.length === 0 ? (
          <div className="py-20 text-center text-[var(--fumaca)] border border-dashed border-[var(--linha)] rounded-xl">
            {project.status === "processing" ? "O projeto está sendo processado. Os cortes aparecerão aqui em breve." : "Nenhum corte gerado."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {project.clips.map(clip => (
              <Card key={clip.id} className="bg-[var(--superficie-2)] border-[var(--linha)]">
                <div className="aspect-[9/16] bg-black relative">
                  {/* Clip Player or Thumbnail here */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[var(--fumaca)] text-xs">Thumbnail</span>
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="font-semibold text-sm text-[var(--marfim)] truncate">{clip.title}</p>
                  <p className="text-xs text-[var(--ouro)] mt-1">Score: {clip.viralityScore ?? 'N/A'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```
*(Note: UploadedFile might not have `userId` column directly. We will query by `id` and optionally check if the user is authorized by looking at a relation, or we can just query by ID if it's safe. We must check `schema.prisma` in implementation to be precise).*

- [ ] **Step 2: Connect the Card Link**

In `src/components/dashboard/recent-videos-client.tsx`, wrap the Project `<Card>` in a `<Link href={\`/dashboard/projects/\${file.id}\`}>`.

- [ ] **Step 3: Verify build/typecheck**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: No commit**

Wait for user approval instead of committing (AGENTS.md rule).
