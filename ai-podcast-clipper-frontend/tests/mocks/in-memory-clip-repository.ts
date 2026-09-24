import type { ClipEntity } from "~/domain/entities/clip";
import type {
  CreateClipInput,
  IClipRepository,
  UpdateClipInput,
} from "~/domain/ports/clip-repository";

export class InMemoryClipRepository implements IClipRepository {
  public clips: Map<string, ClipEntity> = new Map();

  async findById(id: string): Promise<ClipEntity | null> {
    return this.clips.get(id) ?? null;
  }

  async findByUserId(userId: string): Promise<ClipEntity[]> {
    return Array.from(this.clips.values()).filter(
      (clip) => clip.userId === userId
    );
  }

  async findByUploadedFileId(uploadedFileId: string): Promise<ClipEntity[]> {
    return Array.from(this.clips.values()).filter(
      (clip) => clip.uploadedFileId === uploadedFileId
    );
  }

  async createMany(clips: CreateClipInput[]): Promise<number> {
    const now = new Date();
    for (const input of clips) {
      const id = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const clip: ClipEntity = {
        id,
        userId: input.userId,
        uploadedFileId: input.uploadedFileId ?? null,
        s3Key: input.s3Key,
        title: input.title,
        hook: input.hook ?? null,
        viralityScore: input.viralityScore ?? null,
        reason: input.reason ?? null,
        startTime: input.startTime,
        endTime: input.endTime,
        durationSeconds: input.durationSeconds,
        subtitlePreset: input.subtitlePreset ?? "HORMOZI",
        layoutMode: input.layoutMode ?? "SMART_CROP",
        transcriptWords: input.transcriptWords,
        createdAt: now,
        updatedAt: now,
      };
      this.clips.set(id, clip);
    }
    return clips.length;
  }

  async update(id: string, input: UpdateClipInput): Promise<ClipEntity> {
    const clip = this.clips.get(id);
    if (!clip) {
      throw new Error(`Clip ${id} not found`);
    }

    const updated: ClipEntity = {
      ...clip,
      ...(input.title !== undefined && { title: input.title }),
      ...(input.subtitlePreset !== undefined && {
        subtitlePreset: input.subtitlePreset,
      }),
      ...(input.transcriptWords !== undefined && {
        transcriptWords: input.transcriptWords,
      }),
      updatedAt: new Date(),
    };

    this.clips.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.clips.delete(id);
  }
}
