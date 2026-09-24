# Project Management and Minimalist UI Redesign

## 1. Overview
This specification details the implementation of project management features (Delete and Rename) and a minimalist UI redesign for the project cards. It also covers the automatic extraction of thumbnails for local video uploads.

## 2. Architecture & Database
- **Prisma Schema Update**: Add `thumbnailUrl String?` to the `UploadedFile` model.
- **Data Deletion Policy**: The Prisma model already has `onDelete: Cascade` for `Clip`s tied to `UploadedFile`. However, the physical files must be removed.
- **Storage Gateways**: Both `S3StorageGateway` and `LocalStorageGateway` must support a `deleteFile(key: string)` method.

## 3. Use Cases (Clean Architecture)
- **`RenameProjectUseCase`**:
  - **Input**: `userId: string`, `projectId: string`, `newName: string`.
  - **Action**: Updates the `displayName` of the `UploadedFile` matching `projectId` and `userId`.
- **`DeleteProjectUseCase`**:
  - **Input**: `userId: string`, `projectId: string`.
  - **Action**: 
    1. Fetch the project and all associated clips.
    2. Call `IStorageGateway.deleteFile()` for the original video `s3Key`.
    3. Iterate over clips and call `IStorageGateway.deleteFile()` for each clip's `s3Key`.
    4. Call `IUploadedFileRepository.delete(projectId)` (which cascades DB deletion for clips).

## 4. Automatic Thumbnail Generation
- **Frontend Utility**: A new helper function `generateVideoThumbnail(file: File): Promise<string>` will be created.
- **Implementation**: 
  - Loads the uploaded file into an invisible `<video>` tag via `URL.createObjectURL`.
  - Seeks to `currentTime = 1.0` (or `0.1` if video is shorter).
  - Draws the video frame onto a `<canvas>`.
  - Exports to a base64 Data URL (`image/jpeg`, 0.7 quality).
- **Integration**: During the file upload process in `GenerateUploadUrlUseCase` / `create-project-client.tsx`, this base64 string will be saved to `thumbnailUrl`. For YouTube videos, the standard `img.youtube.com/vi/<id>/maxresdefault.jpg` will be used.

## 5. UI Changes (Frontend)
- **Minimalist Project Card**: 
  - The image/thumbnail will be full-bleed at the top.
  - The footer containing the title and stats will have reduced padding (e.g., `p-2` or `p-3`).
- **Action Menu (3-dots)**:
  - Positioned in the top-right corner of the thumbnail.
  - Options: "Renomear" (Rename) and "Excluir" (Delete).
- **Modals**:
  - **Delete Modal**: A red-themed destructive alert dialogue warning the user: "Esta ação apagará permanentemente o vídeo original e todos os cortes gerados para liberar espaço. Deseja continuar?".
  - **Rename Modal**: A simple dialog with an input field prepopulated with the current `displayName` or `filename`.
