import { DomainError } from "../errors/domain-error";
import { calculateVideoCredits } from "../rules/calculate-credits";

export type SourceType = "UPLOAD" | "YOUTUBE";

export type UploadedFileStatus =
  | "queued"
  | "processing"
  | "processed"
  | "no credits"
  | "failed";

export interface UploadedFileEntity {
  id: string;
  userId: string;
  s3Key: string;
  displayName?: string | null;
  sourceType: SourceType;
  youtubeUrl?: string | null;
  durationSeconds: number;
  creditsCost: number;
  uploaded: boolean;
  status: UploadedFileStatus;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUploadedFileInput {
  id: string;
  userId: string;
  s3Key: string;
  displayName?: string | null;
  sourceType?: SourceType;
  youtubeUrl?: string | null;
  durationSeconds?: number;
  creditsCost?: number;
  uploaded?: boolean;
}

export class UploadedFile {
  public readonly id: string;
  public readonly userId: string;
  private _s3Key: string;
  private _displayName?: string | null;
  public readonly sourceType: SourceType;
  public readonly youtubeUrl?: string | null;
  private _durationSeconds: number;
  private _creditsCost: number;
  private _uploaded: boolean;
  private _status: UploadedFileStatus;
  private _errorMessage?: string | null;
  public readonly createdAt: Date;
  private _updatedAt: Date;

  /**
   * Construtor privado: instanciação permitida apenas via factory methods
   */
  private constructor(
    id: string,
    userId: string,
    s3Key: string,
    displayName: string | null | undefined,
    sourceType: SourceType,
    youtubeUrl: string | null | undefined,
    durationSeconds: number,
    creditsCost: number,
    uploaded: boolean,
    status: UploadedFileStatus,
    errorMessage: string | null | undefined,
    createdAt: Date,
    updatedAt: Date
  ) {
    if (!id || id.trim() === "") {
      throw new DomainError("O ID do arquivo não pode ser vazio.");
    }
    if (!userId || userId.trim() === "") {
      throw new DomainError("O ID do usuário não pode ser vazio.");
    }
    if (!s3Key || s3Key.trim() === "") {
      throw new DomainError("A chave S3 do arquivo não pode ser vazia.");
    }

    this.id = id;
    this.userId = userId;
    this._s3Key = s3Key;
    this._displayName = displayName ?? null;
    this.sourceType = sourceType;
    this.youtubeUrl = youtubeUrl ?? null;
    this._durationSeconds = durationSeconds;
    this._creditsCost = creditsCost;
    this._uploaded = uploaded;
    this._status = status;
    this._errorMessage = errorMessage ?? null;
    this.createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  /**
   * Factory para criar um novo arquivo no sistema
   */
  public static create(input: CreateUploadedFileInput): UploadedFile {
    const now = new Date();
    const duration = input.durationSeconds ?? 0;
    const cost = input.creditsCost ?? calculateVideoCredits(duration);

    return new UploadedFile(
      input.id,
      input.userId,
      input.s3Key,
      input.displayName,
      input.sourceType ?? "UPLOAD",
      input.youtubeUrl,
      duration,
      cost,
      input.uploaded ?? false,
      "queued",
      null,
      now,
      now
    );
  }

  /**
   * Factory para reconstituir um arquivo persistido a partir do banco de dados
   */
  public static restore(data: UploadedFileEntity): UploadedFile {
    return new UploadedFile(
      data.id,
      data.userId,
      data.s3Key,
      data.displayName,
      data.sourceType,
      data.youtubeUrl,
      data.durationSeconds,
      data.creditsCost,
      data.uploaded,
      data.status,
      data.errorMessage,
      data.createdAt,
      data.updatedAt
    );
  }

  // Getters
  get s3Key(): string {
    return this._s3Key;
  }

  get displayName(): string | null | undefined {
    return this._displayName;
  }

  get durationSeconds(): number {
    return this._durationSeconds;
  }

  get creditsCost(): number {
    return this._creditsCost;
  }

  get uploaded(): boolean {
    return this._uploaded;
  }

  get status(): UploadedFileStatus {
    return this._status;
  }

  get errorMessage(): string | null | undefined {
    return this._errorMessage;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // Invariantes e Transições de Estado
  public markProcessing(): void {
    if (this._status === "processed") {
      throw new DomainError("Não é possível reprocessar um arquivo que já foi finalizado.");
    }
    this._status = "processing";
    this._updatedAt = new Date();
  }

  public markProcessed(): void {
    this._status = "processed";
    this._errorMessage = null;
    this._updatedAt = new Date();
  }

  public markFailed(reason: string): void {
    this._status = "failed";
    this._errorMessage = reason;
    this._updatedAt = new Date();
  }

  public markNoCredits(reason = "Saldo de créditos insuficiente"): void {
    this._status = "no credits";
    this._errorMessage = reason;
    this._updatedAt = new Date();
  }

  public updateDurationAndSource(
    durationSeconds: number,
    s3Key: string,
    displayName?: string
  ): void {
    this._durationSeconds = durationSeconds;
    this._s3Key = s3Key;
    if (displayName) {
      this._displayName = displayName;
    }
    this._creditsCost = this.calculateRequiredCredits();
    this._updatedAt = new Date();
  }

  public calculateRequiredCredits(): number {
    return calculateVideoCredits(this._durationSeconds);
  }

  public isProcessing(): boolean {
    return this._status === "processing";
  }

  public isProcessed(): boolean {
    return this._status === "processed";
  }

  public isFailed(): boolean {
    return this._status === "failed";
  }

  public toJSON(): UploadedFileEntity {
    return {
      id: this.id,
      userId: this.userId,
      s3Key: this._s3Key,
      displayName: this._displayName,
      sourceType: this.sourceType,
      youtubeUrl: this.youtubeUrl,
      durationSeconds: this._durationSeconds,
      creditsCost: this._creditsCost,
      uploaded: this._uploaded,
      status: this._status,
      errorMessage: this._errorMessage,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
