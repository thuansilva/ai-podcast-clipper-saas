# Guia de Configuração: Exclusão Automática de Vídeos Originais no AWS S3 (Lifecycle Rules)

Este documento registra a estratégia e o passo a passo para configurar **Regras de Ciclo de Vida (Lifecycle Rules)** no Amazon S3, garantindo a exclusão automática de vídeos originais pesados e reduzindo custos de armazenamento em até **95%**, sem comprometer os clipes/reels gerados.

---

## 1. Por que essa configuração é necessária?

No fluxo de processamento do **AI Podcast Clipper SaaS**:

| Pasta / Prefixo S3 | Conteúdo | Tamanho Médio | Ciclo de Vida Necessário |
| :--- | :--- | :--- | :--- |
| `uploads/` | Vídeos brutos enviados do computador do usuário | 500 MB a 2 GB | **Temporário**: Necessário apenas durante o processamento da IA (1 a 5 minutos). |
| `youtube/` | Vídeos brutos baixados do YouTube pelo worker | 500 MB a 2 GB | **Temporário**: Necessário apenas durante o processamento da IA (1 a 5 minutos). |
| `clips/` | Cortes / Reels finais gerados em 9:16 com legendas | 15 MB a 35 MB | **Permanente**: Arquivos independentes que os usuários assistem e baixam no Dashboard. |

> [!IMPORTANT]
> **Os clipes na pasta `clips/` são totalmente independentes do vídeo original.**
> Uma vez que o clipe foi renderizado e salvo em `clips/`, o arquivo original em `uploads/` ou `youtube/` **pode ser apagado com segurança**, pois a reprodução e o download dos clipes continuarão funcionando perfeitamente.

### Exemplo de economia real
- **Sem regra de ciclo de vida:** 100 podcasts processados = **~150 GB** acumulados todo mês (~$3,45/mês fixo recorrente só de vídeos brutos parados).
- **Com exclusão em 1 dia:** Os mesmos 100 podcasts geram 300 clipes = **apenas ~6 GB** em `clips/` (~$0,14/mês). **Economia de mais de 95%**.

---

## 2. Passo a Passo pelo Console da AWS (Interface Web)

### Passo 1: Acessar as configurações do Bucket
1. Acesse o [Console da AWS](https://console.aws.amazon.com/s3/).
2. Navegue até o serviço **Amazon S3** > **Buckets**.
3. Clique no nome do bucket usado pelo projeto (definido na variável `S3_BUCKET_NAME`).
4. Clique na aba **Management** (Gerenciamento).
5. Na seção **Lifecycle rules** (Regras de ciclo de vida), clique em **Create lifecycle rule** (Criar regra de ciclo de vida).

---

### Passo 2: Criar a Regra para `uploads/`
1. **Lifecycle rule name:** `auto-delete-raw-uploads`
2. **Choose a rule scope:** Selecione **"Limit the scope of this rule using one or more filters"** (Limitar o escopo desta regra usando um ou mais filtros).
3. **Prefix:** Digite `uploads/` (com a barra no final).
4. **Lifecycle rule actions:** Marcar a opção **"Expire current versions of objects"** (Expirar versões atuais dos objetos).
5. **Expire current versions of objects:**
   - **Days after object creation:** Digite `1` (ou `2` dias para margem de segurança).
6. Clique em **Create rule** (Criar regra).

---

### Passo 3: Criar a Regra para `youtube/`
1. Clique novamente em **Create lifecycle rule**.
2. **Lifecycle rule name:** `auto-delete-youtube-downloads`
3. **Choose a rule scope:** Selecione **"Limit the scope of this rule using one or more filters"**.
4. **Prefix:** Digite `youtube/` (com a barra no final).
5. **Lifecycle rule actions:** Marcar a opção **"Expire current versions of objects"**.
6. **Expire current versions of objects:**
   - **Days after object creation:** Digite `1` (ou `2` dias).
7. Clique em **Create rule**.

---

## 3. Configuração Alternativa via AWS CLI (Terminal)

Se preferir aplicar a configuração em poucos segundos via linha de comando:

1. Crie um arquivo temporário chamado `lifecycle.json`:

```json
{
  "Rules": [
    {
      "ID": "auto-delete-raw-uploads",
      "Filter": {
        "Prefix": "uploads/"
      },
      "Status": "Enabled",
      "Expiration": {
        "Days": 1
      }
    },
    {
      "ID": "auto-delete-youtube-downloads",
      "Filter": {
        "Prefix": "youtube/"
      },
      "Status": "Enabled",
      "Expiration": {
        "Days": 1
      }
    }
  ]
}
```

2. Execute o comando no terminal (substituindo `<SEU_BUCKET>` pelo nome do bucket):

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket <SEU_BUCKET> \
  --lifecycle-configuration file://lifecycle.json
```

3. Confirme que as regras foram ativadas:

```bash
aws s3api get-bucket-lifecycle-configuration --bucket <SEU_BUCKET>
```

---

## 4. Configuração Alternativa via Terraform / OpenTofu (IaC)

Caso utilize Terraform para gerenciar a infraestrutura na AWS:

```hcl
resource "aws_s3_bucket_lifecycle_configuration" "cleanup_raw_videos" {
  bucket = aws_s3_bucket.media.id

  rule {
    id     = "auto-delete-raw-uploads"
    status = "Enabled"

    filter {
      prefix = "uploads/"
    }

    expiration {
      days = 1
    }
  }

  rule {
    id     = "auto-delete-youtube-downloads"
    status = "Enabled"

    filter {
      prefix = "youtube/"
    }

    expiration {
      days = 1
    }
  }
}
```

---

## 5. Perguntas Frequentes (FAQ)

### 1. A exclusão de objetos pelo Lifecycle custa algo?
**Não.** A expiração de objetos gerenciada pelo S3 Lifecycle é uma operação interna e **100% gratuita** da AWS (não consome requisições de DELETE pagas).

### 2. E se o processamento do vídeo demorar mais de 1 dia?
O pipeline de inteligência artificial (Inngest + GPU Modal) leva entre **1 a 5 minutos** para finalizar a transcrição, corte e renderização. Um prazo de 1 dia (24 horas) oferece uma margem de segurança de mais de **99,5%**.

### 3. O que acontece com a pasta `clips/`?
Como as regras possuem o filtro de prefixo restrito a `uploads/` e `youtube/`, a pasta `clips/` **nunca é tocada**, garantindo que seus usuários continuem acessando e baixando seus reels a qualquer momento.
