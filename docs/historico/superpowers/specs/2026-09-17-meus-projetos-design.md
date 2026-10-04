# Design Spec: Meus Projetos Restructure & Clips Drill-down

## Objective
Convert the current "Meus Vídeos" generic list into a hierarchical "Meus Projetos" structure. A "Project" represents the original uploaded video. Inside a project, the user can view the "Clips" (the short videos generated from that project). The projects list must feature search, sorting, and infinite scroll pagination.

## UI/UX Flow
1. **Sidebar Navigation**: "Meus Vídeos" becomes "Meus Projetos" (`/dashboard/projects`).
2. **Projects List (`/dashboard/projects`)**: 
   - Displays a grid of Project Cards (the original uploaded video banner, title, creation date, and status).
   - A toolbar above the grid contains:
     - **Search Input**: Filters projects by title (debounced).
     - **Sort Select**: Orders by newest/oldest.
   - **Infinite Scroll**: Instead of numbered pagination, scrolling to the bottom of the list automatically loads the next batch of projects.
3. **Project Details (`/dashboard/projects/[id]`)**:
   - A dedicated page for a single project.
   - Displays a header with the project's title, source video stats, and a "Back to Projects" breadcrumb.
   - Displays a grid of the generated `Clip`s (e.g., the 10 short videos) with their specific metrics (virality score, duration, etc).

## Technical Architecture

### 1. Route Changes
- Move `src/app/dashboard/videos` to `src/app/dashboard/projects`.
- Create `src/app/dashboard/projects/[id]/page.tsx` for the clips view.

### 2. Infinite Scroll Implementation
- Create a Server Action `src/actions/projects.ts` -> `getProjectsPage(page, search, sort)` calling the existing `ListUserVideosUseCase`.
- Replace the current Shadcn `<Pagination>` with a client component `InfiniteProjectsList`.
- `InfiniteProjectsList` takes initial data (Page 1) from the Server Component.
- Uses `react-intersection-observer` (or a simple sentinel `div` with `useEffect` + `IntersectionObserver`) to trigger the fetching of `page + 1` via the Server Action when the user reaches the bottom.

### 3. Filters
- The existing `videos-toolbar.tsx` logic will be adapted to `projects-toolbar.tsx`. 
- Changing search or sort updates the URL query params (`?search=...&sort=...`), which resets the Infinite Scroll list to Page 1 via standard Next.js navigation.

### 4. Prisma Integration
- **Project**: Maps to `UploadedFile`.
- **Clips**: Maps to `Clip`.
- The `[id]/page.tsx` route will query `db.uploadedFile.findUnique({ include: { clips: true } })`.

## Open Questions / Clarifications
- If a project is still processing, the user can still enter the project page to see its status, but the clips grid will show an empty state or skeleton loaders.
