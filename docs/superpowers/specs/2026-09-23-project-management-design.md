# Gerenciamento de Projetos e Redesign Minimalista da Interface

## 1. Visão Geral
Esta especificação detalha a implementação das funcionalidades de gerenciamento de projetos (Excluir e Renomear) e um redesign minimalista da interface para os cartões de projeto. O documento também aborda a extração automática de miniaturas (thumbnails) para os vídeos locais enviados pelo usuário.

## 2. Arquitetura & Banco de Dados
- **Atualização do Schema Prisma**: Adição da coluna `thumbnailUrl String?` ao modelo `UploadedFile`.
- **Política de Exclusão de Dados**: O modelo Prisma já possui `onDelete: Cascade` para os cortes (`Clip`) vinculados ao `UploadedFile`. No entanto, os arquivos físicos também precisam ser removidos.
- **Gateways de Storage**: Ambos os gateways, `S3StorageGateway` e `LocalStorageGateway`, devem suportar o método `deleteFile(key: string)`.

## 3. Casos de Uso (Clean Architecture)
- **`RenameProjectUseCase`**:
  - **Entrada**: `userId: string`, `projectId: string`, `newName: string`.
  - **Ação**: Atualiza o campo `displayName` do `UploadedFile` que corresponde ao `projectId` e `userId`.
- **`DeleteProjectUseCase`**:
  - **Entrada**: `userId: string`, `projectId: string`.
  - **Ação**: 
    1. Busca o projeto e todos os seus cortes associados no banco.
    2. Chama o método `IStorageGateway.deleteFile()` para apagar o vídeo original (`s3Key`).
    3. Itera sobre os cortes gerados e chama `IStorageGateway.deleteFile()` para cada um deles.
    4. Chama o método `IUploadedFileRepository.delete(projectId)` (que faz a exclusão em cascata no banco de dados para os registros dos cortes).

## 4. Geração Automática de Thumbnail
- **Utilitário Frontend**: Será criada uma nova função auxiliar `generateVideoThumbnail(file: File): Promise<string>`.
- **Implementação**: 
  - Carrega o arquivo selecionado para upload em uma tag invisível `<video>` usando `URL.createObjectURL`.
  - Avança o tempo do vídeo para `currentTime = 1.0` (ou `0.1` se o vídeo for muito curto).
  - "Desenha" o quadro do vídeo em um elemento `<canvas>`.
  - Exporta esse quadro para uma URL em Base64 (formato `image/jpeg`, qualidade 0.7).
- **Integração**: Durante o processo de envio do arquivo (`create-project-client.tsx`), essa string Base64 será enviada e salva na coluna `thumbnailUrl`. Para vídeos do YouTube, será utilizada a miniatura padrão (`img.youtube.com/vi/<id>/maxresdefault.jpg`).

## 5. Alterações de UI (Frontend)
- **Cartão de Projeto Minimalista**: 
  - A imagem/miniatura ocupará todo o espaço superior, colada nas bordas (sem margens laterais).
  - O rodapé contendo o título e as estatísticas terá seu espaçamento (padding) reduzido (ex: `p-2` ou `p-3`) para achatar o bloco e focar a atenção na imagem.
- **Menu de Ações (3 pontinhos)**:
  - Posicionado no canto superior direito por cima da miniatura (com um leve fundo escuro para garantir leitura).
  - Opções: "Renomear" e "Excluir".
- **Modais**:
  - **Modal de Exclusão**: Uma caixa de diálogo de alerta com tema destrutivo (vermelho), avisando o usuário: "Atenção: Esta ação apagará permanentemente o vídeo original e todos os cortes gerados para liberar espaço. Deseja continuar?".
  - **Modal de Renomear**: Uma caixa de diálogo simples com um campo de texto (input), pré-preenchido com o `displayName` ou nome original do arquivo.
