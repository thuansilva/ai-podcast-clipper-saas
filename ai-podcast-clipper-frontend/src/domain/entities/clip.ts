import { DomainError } from "../errors/domain-error";

export type SubtitlePreset = "HORMOZI" | "MINIMAL" | "NEON";

export type LayoutMode = "SMART_CROP" | "RESIZE";

export interface ClipEntity {
  id: string;
  userId: string;
  uploadedFileId?: string | null;
  s3Key: string;
  title: string;
  hook?: string | null;
  viralityScore?: number | null;
  reason?: string | null;
  startTime: number;
  endTime: number;
  durationSeconds: number;
  subtitlePreset: SubtitlePreset;
  layoutMode: LayoutMode;
  transcriptWords?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClipInput {
  id: string;
  userId: string;
  uploadedFileId?: string | null;
  s3Key: string;
  title: string;
  startTime: number;
  endTime: number;
  hook?: string | null;
  viralityScore?: number | null;
  reason?: string | null;
  durationSeconds?: number;
  subtitlePreset?: SubtitlePreset;
  layoutMode?: LayoutMode;
  transcriptWords?: unknown;
}

export class Clip {
  public readonly id: string;
  public readonly userId: string;
  public readonly uploadedFileId?: string | null;
  private _s3Key: string;
  private _title: string;
  private _hook?: string | null;
  private _viralityScore?: number | null;
  private _reason?: string | null;
  private _startTime: number;
  private _endTime: number;
  private _durationSeconds: number;
  private _subtitlePreset: SubtitlePreset;
  private _layoutMode: LayoutMode;
  private _transcriptWords?: unknown;
  public readonly createdAt: Date;
  private _updatedAt: Date;

  /**
   * Construtor privado: instanciação permitida apenas via factory methods
   */
  private constructor(
    id: string,
    userId: string,
    uploadedFileId: string | null | undefined,
    s3Key: string,
    title: string,
    hook: string | null | undefined,
    viralityScore: number | null | undefined,
    reason: string | null | undefined,
    startTime: number,
    endTime: number,
    durationSeconds: number,
    subtitlePreset: SubtitlePreset,
    layoutMode: LayoutMode,
    transcriptWords: unknown,
    createdAt: Date,
    updatedAt: Date
  ) {
    if (!title || title.trim() === "") {
      throw new DomainError("O título do clipe não pode ser vazio.");
    }
    if (startTime < 0) {
      throw new DomainError("O tempo de início não pode ser negativo.");
    }
    if (endTime <= startTime) {
      throw new DomainError(
        "O tempo de fim deve ser estritamente maior que o tempo de início."
      );
    }

    this.id = id;
    this.userId = userId;
    this.uploadedFileId = uploadedFileId ?? null;
    this._s3Key = s3Key;
    this._title = title.trim();
    this._hook = hook ?? null;
    this._viralityScore = viralityScore ?? null;
    this._reason = reason ?? null;
    this._startTime = startTime;
    this._endTime = endTime;
    this._durationSeconds = durationSeconds;
    this._subtitlePreset = subtitlePreset;
    this._layoutMode = layoutMode;
    this._transcriptWords = transcriptWords ?? null;
    this.createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  /**
   * Factory para criar um novo clipe no sistema
   */
  public static create(input: CreateClipInput): Clip {
    const now = new Date();
    const duration =
      input.durationSeconds ?? Math.max(0, input.endTime - input.startTime);

    return new Clip(
      input.id,
      input.userId,
      input.uploadedFileId,
      input.s3Key,
      input.title,
      input.hook,
      input.viralityScore,
      input.reason,
      input.startTime,
      input.endTime,
      duration,
      input.subtitlePreset ?? "HORMOZI",
      input.layoutMode ?? "SMART_CROP",
      input.transcriptWords,
      now,
      now
    );
  }

  /**
   * Factory para reconstituir um clipe existente do banco de dados
   */
  public static restore(data: ClipEntity): Clip {
    return new Clip(
      data.id,
      data.userId,
      data.uploadedFileId,
      data.s3Key,
      data.title,
      data.hook,
      data.viralityScore,
      data.reason,
      data.startTime,
      data.endTime,
      data.durationSeconds,
      data.subtitlePreset,
      data.layoutMode,
      data.transcriptWords,
      data.createdAt,
      data.updatedAt
    );
  }

  // Getters
  get s3Key(): string {
    return this._s3Key;
  }

  get title(): string {
    return this._title;
  }

  get hook(): string | null | undefined {
    return this._hook;
  }

  get viralityScore(): number | null | undefined {
    return this._viralityScore;
  }

  get reason(): string | null | undefined {
    return this._reason;
  }

  get startTime(): number {
    return this._startTime;
  }

  get endTime(): number {
    return this._endTime;
  }

  get durationSeconds(): number {
    return this._durationSeconds;
  }

  get subtitlePreset(): SubtitlePreset {
    return this._subtitlePreset;
  }

  get layoutMode(): LayoutMode {
    return this._layoutMode;
  }

  get transcriptWords(): unknown {
    return this._transcriptWords;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // Domain behaviors & invariants
  public isOwnedBy(userId: string): boolean {
    return this.userId === userId;
  }

  public isHighVirality(): boolean {
    return (this._viralityScore ?? 0) >= 8;
  }

  public updateMetadata(data: {
    title?: string;
    subtitlePreset?: SubtitlePreset;
    transcriptWords?: unknown;
  }): void {
    if (data.title !== undefined) {
      if (data.title.trim() === "") {
        throw new DomainError("O título do clipe não pode ser vazio.");
      }
      this._title = data.title.trim();
    }
    if (data.subtitlePreset !== undefined) {
      this._subtitlePreset = data.subtitlePreset;
    }
    if (data.transcriptWords !== undefined) {
      this._transcriptWords = data.transcriptWords;
    }
    this._updatedAt = new Date();
  }

  public toJSON(): ClipEntity {
    return {
      id: this.id,
      userId: this.userId,
      uploadedFileId: this.uploadedFileId,
      s3Key: this._s3Key,
      title: this._title,
      hook: this._hook,
      viralityScore: this._viralityScore,
      reason: this._reason,
      startTime: this._startTime,
      endTime: this._endTime,
      durationSeconds: this._durationSeconds,
      subtitlePreset: this._subtitlePreset,
      layoutMode: this._layoutMode,
      transcriptWords: this._transcriptWords,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
