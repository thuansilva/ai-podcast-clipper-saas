import { db } from "~/server/db";
import { Prisma } from "@prisma/client";
import type {
  ClipEntity,
  LayoutMode,
  SubtitlePreset,
} from "~/domain/entities/clip";
import type {
  CreateClipInput,
  IClipRepository,
  UpdateClipInput,
} from "~/domain/ports/clip-repository";

export class PrismaClipRepository implements IClipRepository {
  async findById(id: string): Promise<ClipEntity | null> {
    const clip = await db.clip.findUnique({
      where: { id },
    });

    if (!clip) return null;

    return {
      id: clip.id,
      userId: clip.userId,
      uploadedFileId: clip.uploadedFileId,
      s3Key: clip.s3Key,
      title: clip.title,
      hook: clip.hook,
      viralityScore: clip.viralityScore,
      reason: clip.reason,
      startTime: clip.startTime,
      endTime: clip.endTime,
      durationSeconds: clip.durationSeconds,
      subtitlePreset: clip.subtitlePreset as SubtitlePreset,
      layoutMode: clip.layoutMode as LayoutMode,
      transcriptWords: clip.transcriptWords,
      createdAt: clip.createdAt,
      updatedAt: clip.updatedAt,
    };
  }

  async findByUserId(userId: string): Promise<ClipEntity[]> {
    const clips = await db.clip.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return clips.map((clip) => ({
      id: clip.id,
      userId: clip.userId,
      uploadedFileId: clip.uploadedFileId,
      s3Key: clip.s3Key,
      title: clip.title,
      hook: clip.hook,
      viralityScore: clip.viralityScore,
      reason: clip.reason,
      startTime: clip.startTime,
      endTime: clip.endTime,
      durationSeconds: clip.durationSeconds,
      subtitlePreset: clip.subtitlePreset as SubtitlePreset,
      layoutMode: clip.layoutMode as LayoutMode,
      transcriptWords: clip.transcriptWords,
      createdAt: clip.createdAt,
      updatedAt: clip.updatedAt,
    }));
  }

  async findByUploadedFileId(uploadedFileId: string): Promise<ClipEntity[]> {
    const clips = await db.clip.findMany({
      where: { uploadedFileId },
      orderBy: { createdAt: "desc" },
    });

    return clips.map((clip) => ({
      id: clip.id,
      userId: clip.userId,
      uploadedFileId: clip.uploadedFileId,
      s3Key: clip.s3Key,
      title: clip.title,
      hook: clip.hook,
      viralityScore: clip.viralityScore,
      reason: clip.reason,
      startTime: clip.startTime,
      endTime: clip.endTime,
      durationSeconds: clip.durationSeconds,
      subtitlePreset: clip.subtitlePreset as SubtitlePreset,
      layoutMode: clip.layoutMode as LayoutMode,
      transcriptWords: clip.transcriptWords,
      createdAt: clip.createdAt,
      updatedAt: clip.updatedAt,
    }));
  }

  async createMany(clips: CreateClipInput[]): Promise<number> {
    const result = await db.clip.createMany({
      data: clips.map((clip) => ({
        userId: clip.userId,
        uploadedFileId: clip.uploadedFileId,
        s3Key: clip.s3Key,
        title: clip.title,
        hook: clip.hook,
        viralityScore: clip.viralityScore,
        reason: clip.reason,
        startTime: clip.startTime,
        endTime: clip.endTime,
        durationSeconds: clip.durationSeconds,
        subtitlePreset: clip.subtitlePreset ?? "HORMOZI",
        layoutMode: clip.layoutMode ?? "SMART_CROP",
        transcriptWords: (clip.transcriptWords ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      })),
    });

    return result.count;
  }

  async update(id: string, input: UpdateClipInput): Promise<ClipEntity> {
    const clip = await db.clip.update({
      where: { id },
      data: {
        ...(input.title !== undefined && { title: input.title }),
        ...(input.subtitlePreset !== undefined && {
          subtitlePreset: input.subtitlePreset,
        }),
        ...(input.transcriptWords !== undefined && {
          transcriptWords: input.transcriptWords as Prisma.InputJsonValue,
        }),
      },
    });

    return {
      id: clip.id,
      userId: clip.userId,
      uploadedFileId: clip.uploadedFileId,
      s3Key: clip.s3Key,
      title: clip.title,
      hook: clip.hook,
      viralityScore: clip.viralityScore,
      reason: clip.reason,
      startTime: clip.startTime,
      endTime: clip.endTime,
      durationSeconds: clip.durationSeconds,
      subtitlePreset: clip.subtitlePreset as SubtitlePreset,
      layoutMode: clip.layoutMode as LayoutMode,
      transcriptWords: clip.transcriptWords,
      createdAt: clip.createdAt,
      updatedAt: clip.updatedAt,
    };
  }

  async delete(id: string): Promise<void> {
    await db.clip.delete({
      where: { id },
    });
  }
}
