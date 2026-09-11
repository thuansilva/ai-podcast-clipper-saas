export interface GenerateUploadUrlInput {
  userId: string;
  filename: string;
  contentType: string;
}

export interface GenerateUploadUrlOutput {
  success: boolean;
  signedUrl: string;
  uploadedFileId: string;
  s3Key: string;
}

export interface ImportYouTubeVideoInput {
  userId: string;
  url: string;
  preset?: string;
}

export interface ImportYouTubeVideoOutput {
  success: boolean;
  uploadedFileId: string;
  s3Key: string;
  videoId: string;
}
