# Project Management and Minimalist UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement rename/delete functionality for projects, cascade deletion of physical files, auto-extract local video thumbnails, and redesign project cards to be minimalist.

**Architecture:** We will update the Prisma schema, implement `RenameProjectUseCase` and `DeleteProjectUseCase` orchestrating `IStorageGateway.deleteFile`, and use an HTML5 `<canvas>` in the frontend to grab video thumbnails. The UI will use Radix/Shadcn for the action menu and modals.

**Tech Stack:** Next.js, Prisma, React, HTML5 Canvas, TailwindCSS, Lucide Icons, Shadcn UI.

**Spec:** docs/superpowers/specs/2026-09-23-project-management-design.md

## Global Constraints

- **Language**: Brazilian Portuguese (pt-BR) microcopy.
- **Rules**: Never run `git commit` without explicit permission (modify working tree only) - wait, this is for standard tasks, but we can write the steps to use working tree. Actually, the rule from AGENTS.md says "Apenas prepare os arquivos ou deixe-os no working directory e solicite aprovação do usuário para efetuar o commit". We'll instruct the implementer not to commit.
- **Design**: Keep minimalist UI matching the AI Clipper aesthetic (`var(--tinta)`, `var(--marfim)`, `var(--ouro)`, `var(--superficie)`).

---

### Task 1: Database & Storage Gateway Updates

**Files:**
- Modify: `ai-podcast-clipper-frontend/prisma/schema.prisma`
- Modify: `ai-podcast-clipper-frontend/src/domain/ports/storage-gateway.ts`
- Modify: `ai-podcast-clipper-frontend/src/infrastructure/storage/local-storage.gateway.ts`
- Modify: `ai-podcast-clipper-frontend/src/infrastructure/storage/s3-storage.gateway.ts`
- Modify: `ai-podcast-clipper-frontend/src/app/api/local-storage/route.ts`

**Interfaces:**
- Produces: `IStorageGateway.deleteFile(key: string): Promise<void>`
- Produces: `thumbnailUrl` field on `UploadedFile`.

- [ ] **Step 1: Update Prisma Schema**
In `schema.prisma`, add `thumbnailUrl String?` to the `UploadedFile` model.

- [ ] **Step 2: Add deleteFile to IStorageGateway**
In `storage-gateway.ts`, add `deleteFile(key: string): Promise<void>;`

- [ ] **Step 3: Implement deleteFile in LocalStorageGateway**
In `local-storage.gateway.ts`, implement `deleteFile`. It should call an API endpoint `DELETE /api/local-storage?key=${key}`.

- [ ] **Step 4: Implement DELETE in local-storage route**
In `route.ts`, export an `async function DELETE(request: NextRequest)`. Use `fs.promises.unlink` on the path. Return 200 OK. Handle errors gracefully (e.g., if file doesn't exist, ignore).

- [ ] **Step 5: Implement deleteFile in S3StorageGateway**
In `s3-storage.gateway.ts`, implement `deleteFile` using `@aws-sdk/client-s3` `DeleteObjectCommand`.

### Task 2: Use Cases & Server Actions

**Files:**
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/delete-project.use-case.ts`
- Create: `ai-podcast-clipper-frontend/src/application/use-cases/rename-project.use-case.ts`
- Modify: `ai-podcast-clipper-frontend/src/actions/generation.ts` (or similar actions file)

**Interfaces:**
- Consumes: `IStorageGateway.deleteFile`
- Produces: `deleteProjectAction(id: string)` and `renameProjectAction(id: string, newName: string)`

- [ ] **Step 1: Implement DeleteProjectUseCase**
Create `delete-project.use-case.ts`. It takes `userId` and `projectId`. It fetches the file with `include: { clips: true }`. Calls `storageGateway.deleteFile(file.s3Key)`. Iterates over `file.clips` and calls `storageGateway.deleteFile(clip.s3Key)`. Finally, calls `repository.delete(projectId)`.

- [ ] **Step 2: Implement RenameProjectUseCase**
Create `rename-project.use-case.ts`. Takes `userId`, `projectId`, `newName`. Calls `repository.update(projectId, { displayName: newName })`.

- [ ] **Step 3: Export Server Actions**
In `actions/generation.ts`, add `deleteProjectAction` and `renameProjectAction`. Ensure they verify auth, instantiate the factories, call the use case, and call `revalidatePath("/dashboard/projects")`.

### Task 3: Automatic Thumbnail Extraction (Frontend)

**Files:**
- Create: `ai-podcast-clipper-frontend/src/lib/video-utils.ts`
- Modify: `ai-podcast-clipper-frontend/src/components/dashboard/create-project-client.tsx`

**Interfaces:**
- Produces: `generateVideoThumbnail(file: File): Promise<string | null>`

- [ ] **Step 1: Write generateVideoThumbnail**
In `video-utils.ts`, write a function that loads a `File` into an invisible `<video>` element via `URL.createObjectURL`. Listen for `loadeddata` and `seeked`. Set `currentTime = Math.min(1.0, video.duration / 2)`. Once seeked, draw to a `<canvas>` and return `canvas.toDataURL("image/jpeg", 0.7)`. Return `null` on error. Clean up the object URL.

- [ ] **Step 2: Integrate into Upload Flow**
In `create-project-client.tsx`, inside `handleUpload`, right before calling `getUploadUrl`, await `generateVideoThumbnail(selectedFile)`. Pass this string as `thumbnailUrl` (modify `GetUploadUrlRequest` and `CreateUploadedFileInput` to accept it if necessary). *Wait, the API takes `GenerateUploadUrlRequest` which might not have `thumbnailUrl`. We might need to pass it to `saveUploadedFile`.*
Actually, just call the server action that saves the DB record and pass `thumbnailUrl`.

### Task 4: Minimalist UI Redesign & Modals

**Files:**
- Modify: `ai-podcast-clipper-frontend/src/components/dashboard/recent-videos-client.tsx`

**Interfaces:**
- Consumes: Server actions for rename/delete.

- [ ] **Step 1: Redesign the Card Header (Image)**
In `recent-videos-client.tsx`, ensure the image `div` touches the top borders. Use `file.thumbnailUrl` if available, falling back to YouTube thumbnail or default image. 

- [ ] **Step 2: Redesign the Card Footer**
Reduce the padding of the `CardContent` to `p-2 sm:p-3`. Make the title slightly smaller and tighter.

- [ ] **Step 3: Add Dropdown Menu**
Import `DropdownMenu` components from Shadcn. Add a three-dots icon (`MoreVertical`) in the top right of the image (absolute positioning, z-10, with a semi-transparent dark background).

- [ ] **Step 4: Implement Delete & Rename Modals**
Create local state for `isDeleteDialogOpen` and `isRenameDialogOpen`, keeping track of the selected project. Use Shadcn `Dialog` or `AlertDialog` for both. The delete dialog should be destructive and warn about physical file deletion. The rename dialog should have an input field prepopulated with `displayName || filename`. Tie these to the server actions and show toasts on success.
