# Arquitetura do Banco de Dados

Este diagrama reflete a estrutura atual do seu banco de dados, configurada no `schema.prisma`.

```mermaid
erDiagram
    User ||--o| Subscription : "tem uma (1:1)"
    User ||--o{ CreditTransaction : "gera (1:N)"
    User ||--o{ UploadedFile : "faz upload (1:N)"
    User ||--o{ Clip : "possui (1:N)"
    UploadedFile ||--o{ Clip : "gera (1:N)"

    User {
        String id PK
        String name
        String email UK
        DateTime emailVerified
        String password
        Int credits
        Int subscriptionCredits
        Int oneTimeCredits
        Int reservedCredits
        String stripeCustomerId UK
        String image
        String plan
    }

    Subscription {
        String id PK
        String userId FK
        String stripeSubscriptionId UK
        String stripePriceId
        String status "active, canceled, etc"
        DateTime currentPeriodStart
        DateTime currentPeriodEnd
        Boolean cancelAtPeriodEnd
        String plan "CREATOR, PRO_STUDIO"
        Int monthlyCredits
        DateTime createdAt
        DateTime updatedAt
    }

    CreditTransaction {
        String id PK
        String userId FK
        Int amount
        String type "PURCHASE, HOLD, CONSUME, REFUND"
        String description
        DateTime createdAt
    }

    UploadedFile {
        String id PK
        String userId FK
        String s3Key
        String displayName
        String sourceType "UPLOAD, YOUTUBE"
        String youtubeUrl
        Int durationSeconds
        Int sliceStartTime
        Int sliceEndTime
        Int creditsCost
        Boolean uploaded
        String status "queued, processing, processed..."
        String errorMessage
        String genre
        String clipModel
        String aspectRatio
        Boolean autoZoom
        String subtitlePreset
        DateTime createdAt
        DateTime updatedAt
    }

    Clip {
        String id PK
        String uploadedFileId FK
        String userId FK
        String s3Key
        String title
        String hook
        Float viralityScore
        String reason
        Float startTime
        Float endTime
        Float durationSeconds
        String subtitlePreset
        String layoutMode
        Json transcriptWords
        DateTime createdAt
        DateTime updatedAt
    }

    ProcessingOption {
        String id PK
        String type "GENRE, DURATION, ASPECT_RATIO..."
        String value
        String label
        Int order
        Boolean isActive
        Boolean isDefault
        DateTime createdAt
        DateTime updatedAt
    }
```

## Resumo das Entidades Principais

- **`User` e `Subscription`**: Gerenciam o acesso, autenticação e dados do Stripe. O sistema de créditos foi fragmentado de forma robusta (`subscriptionCredits`, `oneTimeCredits` e `reservedCredits`) para suportar a arquitetura de "hold" do processamento.
- **`CreditTransaction`**: Ledger (Livro-razão) de créditos, documentando com segurança cada pacote comprado, saldo reservado ou estornado por falha.
- **`UploadedFile`**: Representa um "Projeto/Vídeo Base", seja upado direto ou baixado do YouTube. Contém o status do processamento para gerenciar a fila do Inngest.
- **`Clip`**: Os cortes finais em formato 9:16 gerados pelo seu novo Backend GPU local, relacionados diretamente ao arquivo base que os originou e contendo métricas de *virality score* calculadas pela IA.
- **`ProcessingOption`**: Tabela de parametrização global (para renderizar dinamicamente estilos de legenda, modelos de IA e formatos na UI).
