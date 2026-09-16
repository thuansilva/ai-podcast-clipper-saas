# Dynamic Video Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement dynamic, database-driven processing options (Genre, Duration, Layout, Aspect Ratio, Auto Zoom, Subtitles) for the video slicing flow.

**Architecture:** Prisma for the schema, Next.js `unstable_cache` for a 10-day cached data layer, Zod/Manual validation in the Server Action against the cached list, and Shadcn UI components for the frontend.

**Tech Stack:** Next.js (App Router), Prisma, TailwindCSS, Shadcn/Radix UI, Vitest

**Spec:** `docs/superpowers/specs/2026-09-15-dynamic-video-options-design.md`

## Global Constraints

- **Testing**: All use cases and core logic must have unit tests passing in Vitest.
- **Commits**: Follow conventional commits (`feat:`, `test:`, `refactor:`).
- **Rule**: NEVER run `git commit` or `git push` without EXPLICIT user permission (from `AGENTS.md`).

---

### Task 1: Database Schema & Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: Existing Prisma setup.
- Produces: Updated database schema.

- [ ] **Step 1: Update Prisma schema**

```prisma
model ProcessingOption {
  id        String   @id @default(cuid())
  type      String   // "GENRE", "DURATION", "ASPECT_RATIO", "LAYOUT"
  value     String
  label     String
  order     Int      @default(0)
  isActive  Boolean  @default(true)
  isDefault Boolean  @default(false)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([type, isActive, order])
}
```

Add these to `UploadedFile`:
```prisma
  genre          String?
  targetDuration String?
  aspectRatio    String?
  layout         String?
  autoZoom       Boolean?
  subtitlePreset String?
```

- [ ] **Step 2: Apply Migration**

Run: `npx prisma db push`
Expected: Database syncs successfully.

- [ ] **Step 3: Commit (Wait for permission)**

```bash
git add prisma/schema.prisma
# DO NOT COMMIT YET. Ask user.
```

---

### Task 2: Data Service & Cache Layer

**Files:**
- Create: `src/application/services/processing-options.service.ts`
- Create: `tests/unit/application/services/processing-options.service.test.ts`

**Interfaces:**
- Produces: `getProcessingOptions()` which returns `Promise<Record<string, ProcessingOption[]>>`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from "vitest";
import { getProcessingOptions } from "~/application/services/processing-options.service";

vi.mock("next/cache", () => ({
  unstable_cache: (cb: any) => cb,
}));
vi.mock("~/server/db", () => ({
  db: {
    processingOption: { findMany: vi.fn().mockResolvedValue([{ type: "GENRE", value: "humor", label: "Humor" }]) }
  }
}));

describe("getProcessingOptions", () => {
  it("groups options by type", async () => {
    const res = await getProcessingOptions();
    expect(res.GENRE).toBeDefined();
    expect(res.GENRE[0].value).toBe("humor");
  });
});
```

- [ ] **Step 2: Run test (fails)**
Run: `npx vitest run tests/unit/application/services/processing-options.service.test.ts`

- [ ] **Step 3: Implement Service**

```typescript
import { unstable_cache } from "next/cache";
import { db } from "~/server/db";

export type ProcessingOption = {
  id: string; type: string; value: string; label: string;
  order: number; isActive: boolean; isDefault: boolean;
};

export const getProcessingOptions = unstable_cache(
  async () => {
    const options = await db.processingOption.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" }
    });
    
    return options.reduce((acc, opt) => {
      if (!acc[opt.type]) acc[opt.type] = [];
      acc[opt.type].push(opt);
      return acc;
    }, {} as Record<string, ProcessingOption[]>);
  },
  ['processing-options'],
  { revalidate: 864000 }
);
```

- [ ] **Step 4: Run test (passes)**
Run: `npx vitest run tests/unit/application/services/processing-options.service.test.ts`

- [ ] **Step 5: Stage files**
```bash
git add src/application/services/processing-options.service.ts tests/
```

---

### Task 3: Server Action Validation

**Files:**
- Modify: `src/actions/youtube.ts`
- Modify: `src/application/dtos/video-dtos.ts`

**Interfaces:**
- Consumes: `getProcessingOptions()`
- Produces: Validated payload passed to UseCase.

- [ ] **Step 1: Update DTO**

Update `ImportYouTubeVideoInput` in both files to include `genre`, `targetDuration`, `aspectRatio`, `layout`, `autoZoom` (boolean).

- [ ] **Step 2: Add validation to `importYouTubeVideo` Action**

```typescript
// Inside importYouTubeVideo, before useCase.execute:
import { getProcessingOptions } from "~/application/services/processing-options.service";

const options = await getProcessingOptions();

if (input.genre && !options.GENRE?.some(o => o.value === input.genre)) throw new DomainError("Invalid genre");
if (input.targetDuration && !options.DURATION?.some(o => o.value === input.targetDuration)) throw new DomainError("Invalid duration");
if (input.aspectRatio && !options.ASPECT_RATIO?.some(o => o.value === input.aspectRatio)) throw new DomainError("Invalid aspect ratio");
if (input.layout && !options.LAYOUT?.some(o => o.value === input.layout)) throw new DomainError("Invalid layout");
```

- [ ] **Step 3: Stage files**
```bash
git add src/actions/youtube.ts src/application/dtos/video-dtos.ts
```

---

### Task 4: UseCase & Inngest Payload

**Files:**
- Modify: `src/application/use-cases/videos/import-youtube-video.use-case.ts`
- Modify: `src/inngest/functions.ts`

**Interfaces:**
- Consumes: Validated DTO
- Produces: DB persistence and exact JSON payload for Python.

- [ ] **Step 1: Persist fields in UseCase**

In `import-youtube-video.use-case.ts`, add the new fields to the `db.uploadedFile.create` data object.

- [ ] **Step 2: Update Inngest Function**

In `src/inngest/functions.ts` inside `process-video`, extract the fields from `video` (UploadedFile) and append them to the Python fetch payload:
```typescript
body: JSON.stringify({
  s3_key: video.s3Key,
  preset: video.subtitlePreset ?? "NONE",
  genre: video.genre ?? "auto",
  target_duration: video.targetDuration ?? "auto",
  layout_mode: video.layout ?? "auto",
  aspect_ratio: video.aspectRatio ?? "9:16",
  auto_zoom: video.autoZoom ?? true,
  // ... rest
})
```

- [ ] **Step 3: Stage files**
```bash
git add src/application/use-cases/videos/import-youtube-video.use-case.ts src/inngest/functions.ts
```

---

### Task 5: Frontend UI

**Files:**
- Modify: `src/app/dashboard/create/page.tsx`
- Modify: `src/components/dashboard/create-project-client.tsx`

**Interfaces:**
- Consumes: `getProcessingOptions()` and Shadcn UI.
- Produces: Interactive form.

- [ ] **Step 1: Pass options from Page**

In `page.tsx`:
```tsx
import { getProcessingOptions } from "~/application/services/processing-options.service";
// ...
const options = await getProcessingOptions();
return <CreateProjectClient userCredits={userData.credits} options={options} />;
```

- [ ] **Step 2: Update Client UI**

In `create-project-client.tsx`:
- Receive `options` prop.
- Create state for `genre`, `targetDuration`, `aspectRatio`, `layout`, `autoZoom` (defaulting to the first element's value or the `isDefault` one).
- Render `Select` components mapping over `options.GENRE`, etc.
- Render `Switch` for `autoZoom`.
- Add "Sem Legenda" card (sets `preset` to "NONE").
- Include these fields in the `importYouTubeVideo({ ... })` call.

- [ ] **Step 3: Stage files**
```bash
git add src/app/dashboard/create/page.tsx src/components/dashboard/create-project-client.tsx
```
