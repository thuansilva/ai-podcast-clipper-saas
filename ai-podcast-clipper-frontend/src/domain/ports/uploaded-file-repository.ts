import type {
  SourceType,
  UploadedFileEntity,
  UploadedFileStatus,
} from "../entities/uploaded-file";

export interface CreateUploadedFileInput {
  userId: string;
  s3Key: string;
  displayName?: string | null;
  sourceType: SourceType;
  youtubeUrl?: string | null;
  durationSeconds?: number;
  creditsCost?: number;
  uploaded?: boolean;
  status?: UploadedFileStatus;
}

export interface UpdateUploadedFileInput {
  s3Key?: string;
  displayName?: string | null;
  durationSeconds?: number;
  creditsCost?: number;
  uploaded?: boolean;
  status?: UploadedFileStatus;
  errorMessage?: string | null;
}

export interface IUploadedFileRepository {
  findById(id: string): Promise<UploadedFileEntity | null>;
  findByUserId(userId: string): Promise<UploadedFileEntity[]>;
  create(input: CreateUploadedFileInput): Promise<UploadedFileEntity>;
  update(id: string, input: UpdateUploadedFileInput): Promise<UploadedFileEntity>;
  delete(id: string): Promise<void>;
}
