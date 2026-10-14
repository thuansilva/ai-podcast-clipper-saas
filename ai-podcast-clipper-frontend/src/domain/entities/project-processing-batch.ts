/**
 * Entidade de Domínio: ProjectProcessingBatch
 *
 * Representa UM lote de processamento incremental ("adicionar mais cortes")
 * sobre um `UploadedFile` (projeto) já existente — manual (lista de cortes
 * novos) ou automático/IA (um novo slice para a IA analisar). Existe porque
 * os campos hoje em `UploadedFile` (`status`, `creditsCost`,
 * `manualCutsJson`, `sliceStartTime/EndTime`, `s3Key`) assumem um único
 * processamento por projeto — ver `AddClipsToProjectUseCase` para a decisão
 * completa.
 *
 * Cada lote tem seu PRÓPRIO `s3Key` (nunca reaproveita o `s3Key` do projeto
 * nem de um lote anterior — RNF-SEC-18/19 exigem o formato estrito
 * `youtube/<uuid>/original.mp4`, então a forma mais simples de garantir
 * unicidade é gerar um novo `uuid` por lote, exatamente como
 * `ImportYouTubeVideoUseCase` já faz na criação do projeto) e seu próprio
 * ciclo de vida de `status` — uma falha no lote NUNCA deve afetar o
 * `UploadedFile.status` nem os clipes de lotes anteriores.
 */
export type ProjectProcessingBatchMode = "manual" | "auto";

export type ProjectProcessingBatchStatus =
  | "queued"
  | "processing"
  | "processed"
  | "failed";

export interface ProjectProcessingBatchEntity {
  id: string;
  uploadedFileId: string;
  mode: ProjectProcessingBatchMode;
  /**
   * Manual: `ManualCutDTO[]` (tempos absolutos no vídeo ORIGINAL).
   * Auto (IA): `{ startTime: number; endTime: number }` (o slice novo
   * escolhido pelo usuário, tempos absolutos no vídeo ORIGINAL).
   */
  rangesJson: unknown;
  /**
   * Snapshot, no momento da criação do lote, dos intervalos já usados pelo
   * projeto (tempos absolutos no vídeo ORIGINAL) que foram enviados ao
   * backend como `excludedRanges` — guardado para auditoria/depuração, não
   * é recalculado depois.
   */
  excludedRangesJson?: unknown;
  /** Preenchido quando o download do(s) range(s) novo(s) deste lote termina. */
  s3Key?: string | null;
  creditsCost: number;
  status: ProjectProcessingBatchStatus;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateProjectProcessingBatchInput {
  uploadedFileId: string;
  mode: ProjectProcessingBatchMode;
  rangesJson: unknown;
  excludedRangesJson?: unknown;
  s3Key?: string | null;
  creditsCost?: number;
  status?: ProjectProcessingBatchStatus;
}
