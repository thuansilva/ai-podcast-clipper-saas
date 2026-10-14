import type {
  CreateProjectProcessingBatchInput,
  ProjectProcessingBatchEntity,
  ProjectProcessingBatchStatus,
} from "../entities/project-processing-batch";

export interface UpdateProcessingBatchInput {
  s3Key?: string | null;
  creditsCost?: number;
  status?: ProjectProcessingBatchStatus;
  errorMessage?: string | null;
}

export interface IProcessingBatchRepository {
  findById(id: string): Promise<ProjectProcessingBatchEntity | null>;
  findByUploadedFileId(
    uploadedFileId: string
  ): Promise<ProjectProcessingBatchEntity[]>;
  /** Lotes ainda não concluídos ("queued"/"processing") de um projeto — usado
   * para impedir dois processamentos simultâneos no mesmo projeto. */
  findActiveByUploadedFileId(
    uploadedFileId: string
  ): Promise<ProjectProcessingBatchEntity[]>;
  create(
    input: CreateProjectProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity>;
  /**
   * Cria o lote SOMENTE se o projeto não tiver nenhum outro lote ativo
   * ("queued"/"processing"), de forma ATÔMICA (checagem + criação sem janela
   * entre elas). Retorna `null` quando já existe lote ativo.
   *
   * Existe porque `findActiveByUploadedFileId` + `create` em sequência tem
   * uma janela de corrida: 2 requests simultâneas (2 abas, 2 cliques, curl)
   * liam "nenhum lote ativo" e ambas criavam um lote — contornando o
   * bloqueio de sobreposição entre os dois lotes e cobrando 2x.
   */
  createIfNoActive(
    input: CreateProjectProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity | null>;
  update(
    id: string,
    input: UpdateProcessingBatchInput
  ): Promise<ProjectProcessingBatchEntity>;
}
