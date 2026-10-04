# Design Spec: Dynamic Video Processing Options

**Date:** 2026-09-15
**Status:** Approved

## 1. Goal
Provide users with fine-grained control over how their video is processed (Genre, Clip Duration, Aspect Ratio, Layout Mode, Auto-Zoom, and Subtitle presence), driven by a database-backed configuration system.

## 2. Architecture & Data Model

### 2.1 Prisma Schema
We introduce a single, highly flexible table to govern all dropdown options without hardcoding them in the application layer.

```prisma
model ProcessingOption {
  id        String   @id @default(cuid())
  type      String   // "GENRE", "DURATION", "ASPECT_RATIO", "LAYOUT"
  value     String   // e.g., "humor", "less_than_30s", "9:16", "face_focus"
  label     String   // e.g., "Humor e Comédia", "< 30s", "9:16 (Tiktok/Reels)"
  order     Int      @default(0)
  isActive  Boolean  @default(true)
  isDefault Boolean  @default(false)
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([type, isActive, order])
}
```

We extend the `UploadedFile` model to record exactly what the user requested for auditing and retry purposes:
```prisma
// Added to UploadedFile
genre          String?
targetDuration String?
aspectRatio    String?
layout         String?
autoZoom       Boolean?
subtitlePreset String?  // Existing, but now allowing "NONE"
```

## 3. Caching & Performance
To avoid database overhead for options that rarely change, we will create a data access service utilizing Next.js `unstable_cache`.

- **Lifespan**: 10 days (`864000` seconds).
- **Tags**: `['processing-options']` (allows on-demand revalidation if the admin edits the database).
- **Functionality**: `getProcessingOptions()` fetches all active options and groups them by `type` for easy consumption by the frontend.

## 4. Security & Validation
The server action (`importYouTubeVideo`) and the Inngest queue must be protected from malicious input.
1. Action receives the user's choices.
2. Action calls `getProcessingOptions()` (which is instant due to cache).
3. Action asserts that `genre`, `targetDuration`, `aspectRatio`, and `layout` exist in their respective cached lists.
4. If validation fails, the action throws a Domain Error (e.g., "Invalid genre selected").
5. Validated data is appended to the Inngest event payload (`sendProcessVideoEvent`), guaranteeing the Python backend only receives sanitized parameters.

## 5. UI Integration (`/dashboard/create`)
- The server component `CreateProjectPage` will fetch the grouped options via `getProcessingOptions()` and pass them to `CreateProjectClient` as a prop.
- **Components**:
  - `Select`: Genre, Duration, Aspect Ratio, Layout.
  - `Switch`: Auto Zoom toggle.
  - `Cards`: Subtitle style selection, including a new "Sem Legenda" card (maps to `subtitlePreset: "NONE"`).
- Since the options arrive via props from a Server Component, there is no loading layout shifting for these selects.
