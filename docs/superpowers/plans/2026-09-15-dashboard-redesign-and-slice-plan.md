# Dashboard Redesign and Slicing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely redesign the dashboard using a Sidebar Layout, create a new "Create Project" flow with an interactive video slice slider (fetching metadata first), and charge credits based on the selected slice duration.

**Architecture:** We will create a `SidebarLayout` for `/dashboard` and move current dashboard files into `/dashboard/(overview)`. We will implement a new API `/api/youtube/info` using `ytdl-core` or similar to fetch video metadata quickly. We will update the Prisma schema to store `startTime` and `endTime` in `UploadedFile` and refactor the credit calculation to charge `Math.ceil((endTime - startTime) / 60)` credits. 

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Prisma, TypeScript, Lucide React, ytdl-core (or fetch oembed/youtube API).

**Spec:** `docs/superpowers/specs/2026-09-15-dashboard-redesign-and-slice-design.md`

## Global Constraints

- Code must strictly use Tailwind for styling and adhere to the dark theme variables (`var(--tinta)`, `var(--ouro)`, `var(--marfim)`, etc.).
- `npx prisma db push` must be run after schema changes.
- Tests must pass at every step. Do not remove existing tests unless they are made completely obsolete by the layout change, in which case refactor them to match the new layout.

---

### Task 1: Prisma Schema & DB Update

**Files:**
- Modify: `ai-podcast-clipper-frontend/prisma/schema.prisma`

**Interfaces:**
- Produces: Updated `UploadedFile` schema with `sliceStartTime` and `sliceEndTime` fields (both `Int` with default 0).

- [ ] **Step 1: Modify Prisma Schema**
Add `sliceStartTime Int @default(0)` and `sliceEndTime Int @default(0)` to the `UploadedFile` model in `prisma/schema.prisma`.

- [ ] **Step 2: Push DB Changes**
```bash
cd ai-podcast-clipper-frontend && npx prisma db push && npx prisma generate
```

---

### Task 2: Backend Metadata API Endpoint

**Files:**
- Create: `ai-podcast-clipper-frontend/src/app/api/youtube/info/route.ts`

**Interfaces:**
- Produces: `GET /api/youtube/info?url={url}` returning `{ title: string, durationSeconds: number, thumbnailUrl: string }`

- [ ] **Step 1: Create API Endpoint**
Create the Next.js API route that validates the YouTube URL. You can use standard `fetch` against YouTube's oEmbed or a lightweight library (like `ytdl-core` if installed) to get metadata. Since `ytdl-core` can be slow, a quick regex on page source or using `https://www.youtube.com/oembed?url={url}&format=json` (which gives title and thumbnail but not duration) combined with a fallback for duration is required. For simplicity in this plan, assume we use `ytdl-core`'s `getInfo` method to get `videoDetails.lengthSeconds`, `videoDetails.title`, and `videoDetails.thumbnails`.

```typescript
import { NextResponse } from "next/server";
import ytdl from "ytdl-core";
import { YouTubeUrl } from "~/domain/value-objects/youtube-url.vo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !YouTubeUrl.isValid(url)) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  try {
    const info = await ytdl.getBasicInfo(url);
    const thumbnail = info.videoDetails.thumbnails.sort((a, b) => b.width - a.width)[0]?.url;
    return NextResponse.json({
      title: info.videoDetails.title,
      durationSeconds: parseInt(info.videoDetails.lengthSeconds, 10) || 0,
      thumbnailUrl: thumbnail,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch video info" }, { status: 500 });
  }
}
```
*Note: Ensure `ytdl-core` is installed in `ai-podcast-clipper-frontend/package.json`. If not, `npm install ytdl-core`.*

- [ ] **Step 2: Verify API (Manual test)**
No unit test needed for Next.js route, but verify it compiles.

---

### Task 3: Refactor Credit Deduction Logic

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/application/use-cases/credits/hold-credits.use-case.ts`
- Modify: `ai-podcast-clipper-frontend/src/application/use-cases/videos/import-youtube-video.use-case.ts`
- Modify: `ai-podcast-clipper-frontend/src/application/use-cases/videos/trigger-video-processing.use-case.ts`

**Interfaces:**
- Consumes: `sliceStartTime`, `sliceEndTime`
- Produces: Updated credit calculation where cost is `Math.ceil((sliceEndTime - sliceStartTime) / 60)`.

- [ ] **Step 1: Update Import DTOs and Use Cases**
Update `ImportYouTubeVideoInput` in `src/application/dtos/video-dtos.ts` to include optional `sliceStartTime` and `sliceEndTime`. 
Update `ImportYouTubeVideoUseCase` to pass these to the `uploadedFileRepository.create` and to the `sendProcessVideoEvent`.

- [ ] **Step 2: Update Hold Credits Use Case**
Modify `HoldCreditsUseCase` to calculate required credits based on `sliceEndTime - sliceStartTime`. If `sliceEndTime > 0`, `duration = sliceEndTime - sliceStartTime`. The cost is `Math.ceil(duration / 60)`. If manual cuts exist, keep that fallback. Otherwise, use this new slice duration.

- [ ] **Step 3: Update Tests**
Update unit tests for `import-youtube-video.use-case.test.ts` and `hold-credits.use-case.test.ts` to assert the new calculation.

---

### Task 4: Layout & Sidebar Components

**Files:**
- Create: `ai-podcast-clipper-frontend/src/components/dashboard/sidebar.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/dashboard/top-bar.tsx`
- Modify: `ai-podcast-clipper-frontend/src/app/dashboard/layout.tsx`

**Interfaces:**
- Produces: A new layout with a left fixed sidebar and top breadcrumb/profile bar.

- [ ] **Step 1: Create Sidebar Component**
Create a `Sidebar` component displaying links for Dashboard, New Project (`/dashboard/create`), My Videos (`/dashboard/videos`), My Clips (`/dashboard/clips`). Use `lucide-react` icons. 

- [ ] **Step 2: Create Top Bar Component**
Create `TopBar` showing breadcrumbs (e.g. Dashboard / New Project) and User profile (credits, email).

- [ ] **Step 3: Update Layout**
Replace `NavHeader` in `dashboard/layout.tsx` with a grid layout containing the `Sidebar` on the left and `TopBar` + `children` on the right.

---

### Task 5: Refactor Dashboard Index (Home)

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/app/dashboard/page.tsx`
- Modify: `ai-podcast-clipper-frontend/src/components/dashboard-client.tsx` -> Move/Rename to `recent-videos-client.tsx`

**Interfaces:**
- Produces: Blurred thumbnail layout for processing videos.

- [ ] **Step 1: Update Dashboard Index**
Change `DashboardClient` to display a grid of "Recent Videos". For videos in "queued" or "processing" status, display the `thumbnailUrl` (or a placeholder) with a strong `blur-sm` filter and an absolute overlay badge (e.g. `PROCESSANDO...`). 

- [ ] **Step 2: Update Tests**
Ensure any tests for `page.tsx` or `dashboard-client` are updated or rewritten for the new blurred thumbnail layout.

---

### Task 6: New Project Slicing Flow (`/dashboard/create`)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/app/dashboard/create/page.tsx`
- Create: `ai-podcast-clipper-frontend/src/components/dashboard/create-project-client.tsx`
- Modify: `ai-podcast-clipper-frontend/src/components/import-video-tabs.tsx` (or extract its logic)

**Interfaces:**
- Produces: Interactive page with URL input, metadata fetch, Range Slider, visual subtitle selection, and submit button.

- [ ] **Step 1: Create the Component Skeleton**
In `create-project-client.tsx`, setup states for `url`, `metadata` (null initially), `sliceRange` ([start, end]), `subtitlePreset`.

- [ ] **Step 2: Metadata Fetching**
When URL is pasted and validated, fetch `/api/youtube/info?url=...`. Update `metadata` and set `sliceRange` to `[0, min(15 * 60, metadata.durationSeconds)]`.

- [ ] **Step 3: Range Slider and Cost Calculation**
Render an HTML range slider (or two number inputs if easier, or a custom dual-thumb slider component if available in standard HTML/Tailwind) mapped to `0` and `metadata.durationSeconds`. 
Display `Cost: Math.ceil((range[1] - range[0]) / 60) Credits`.

- [ ] **Step 4: Visual Templates for Subtitles**
Render cards for "Viral" (HORMOZI style), "Corporate" (CLEAN style), etc. Allow the user to click to select one.

- [ ] **Step 5: Submit Action**
On submit, call `importYouTubeVideoAction` (the server action) passing the URL, `sliceStartTime`, `sliceEndTime`, and `preset`. Then redirect to `/dashboard`.

- [ ] **Step 6: Write Tests**
Write a basic unit test in `tests/unit/components/create-project.test.tsx` verifying that entering a URL and changing the slice range updates the displayed cost correctly.

---

### Task 7: Finalizing Routes

**Files:**
- Create: `ai-podcast-clipper-frontend/src/app/dashboard/clips/page.tsx`
- Modify: `ai-podcast-clipper-frontend/src/app/dashboard/videos/page.tsx`

- [ ] **Step 1: Move components to proper routes**
Extract the `ClipDisplay` component from the old `TabsContent value="my-clips"` into `/dashboard/clips/page.tsx`.
Ensure the navigation between Sidebar links works correctly and all tests pass.
