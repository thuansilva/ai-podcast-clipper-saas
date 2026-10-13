# Backup e Restore do PostgreSQL (Disaster Recovery)

**Data:** 2026-10-12
**Status:** procedimento documentado, **não executado contra produção**. O provedor do Postgres de produção **ainda não foi definido** e precisa ser confirmado pelo responsável pelo projeto. Os comandos abaixo são genéricos (`pg_dump`/`pg_restore`) e valem para qualquer provedor que exponha uma connection string.
**Relacionados:** `estrategia-rollback.md` (rollback de código e migrations), `aws-s3-lifecycle-rules.md` (regras do bucket S3), `checklist-go-live.md` (item "Backup/restore do Postgres não documentado").

> **Regra do projeto (AGENTS.md):** nenhuma ação que altere produção é executada sem autorização explícita do responsável. Isso inclui restaurar sobre o banco de produção.

---

## 1. Estado atual (o que o repositório comprova)

| Aspecto | Situação | Evidência |
|---|---|---|
| Provedor de produção | **Não definido.** Nenhum provedor é citado no repositório. | Busca em arquivos versionados: não há menção a Neon, Supabase, RDS, Railway, Render ou similar. |
| Conexão | Variável `DATABASE_URL`, lida pelo Prisma | `ai-podcast-clipper-frontend/prisma/schema.prisma` (`url = env("DATABASE_URL")`) |
| Postgres local | Postgres 16 Alpine, somente para desenvolvimento | `docker-compose.yml` (serviço `postgres`) |
| Postgres no CI | Postgres 16 Alpine, efêmero, por job | `.github/workflows/ci.yml` |
| Script de backup | **Não existe** no repositório. Nenhum `pg_dump` ou `pg_restore` versionado. | Busca em arquivos rastreados pelo git |
| Acesso do backend ao banco | **Nenhum.** O backend Python não lê `DATABASE_URL` nem usa driver de Postgres. Ele trabalha com S3 e Gemini. | Busca em `ai-podcast-clipper-backend/` (rastreados) |
| Dados de produção | Ainda não há cliente pagante, segundo a própria migration baseline (`20260926000000_baseline_initial_schema`) | Comentário no `migration.sql` |

Consequência: o plano de DR cobre apenas o banco. Os objetos no S3 (vídeos, clipes) **não são cobertos por este documento** (ver seção 8).

---

## 2. Ferramentas e versão

- Usar cliente `pg_dump` e `pg_restore` na **mesma versão major do servidor, ou mais nova**. Como dev e CI usam Postgres 16, usar cliente 16.
- Os comandos abaixo foram conferidos na documentação oficial do PostgreSQL 16 (`pg_dump` e `pg_restore`). `pg_dump` **não está instalado** no ambiente onde este documento foi escrito, então os comandos não foram executados aqui.
- Ferramentas de apoio: `psql` (criar bancos e consultas de verificação), `aws` CLI (envio para S3), `sha256sum` (checksum), `gpg` ou outra ferramenta de criptografia.

---

## 3. Backup

### 3.1 Formato

Usar o formato **custom** (`--format=custom`, ou `-Fc`). Ele é comprimido, permite restore seletivo e é aceito por `pg_restore`. Um dump em texto puro (`pg_dump` sem `-Fc`) não tem essas vantagens.

### 3.2 Comando

Não colar a connection string diretamente na linha de comando (fica no histórico do shell). Usar variável de ambiente carregada a partir do cofre de segredos do provedor.

```bash
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP="/var/backups/ai-podcast-clipper/ai_podcast_clipper_${STAMP}.dump"

pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  -Z 9 \
  --file="$DUMP" \
  "$DATABASE_URL"

sha256sum "$DUMP" > "${DUMP}.sha256"
```

Significado das flags, conforme a documentação do PostgreSQL 16:

| Flag | Efeito |
|---|---|
| `--format=custom` (`-Fc`) | Saída em formato custom, comprimida. |
| `--no-owner` (`-O`) | Não emite comandos de `OWNER`. O restore não depende do usuário original. |
| `--no-privileges` (`-x`, `--no-acl`) | Não emite `GRANT`/`REVOKE`. Os privilégios são configurados no novo provedor. |
| `-Z 9` | Nível máximo de compressão. |
| `--file` (`-f`) | Arquivo de saída. |

O dump inclui a tabela `_prisma_migrations`, então o histórico de migrations é restaurado junto com os dados.

**Nunca gravar dumps dentro do diretório do repositório.** Eles contêm dados pessoais (e-mails, IDs de cliente Stripe) e dados de cobrança.

### 3.3 Proteção e envio

1. **Criptografar** antes de enviar a qualquer lugar fora da infraestrutura de produção:
   ```bash
   gpg --symmetric --cipher-algo AES256 --output "${DUMP}.gpg" "$DUMP"
   ```
   Guardar a chave de decriptação separadamente do arquivo.
2. **Enviar para armazenamento dedicado.** Recomendação: um bucket S3 **separado** do bucket da aplicação. Se for usar o mesmo bucket, use um prefixo `backups/postgres/` com regra de expiração própria. As regras atuais em `aws-s3-lifecycle-rules.md` afetam somente `uploads/` e `youtube/`, então um prefixo de backup sem regra fica para sempre.
   ```bash
   aws s3 cp "${DUMP}.gpg" "s3://<bucket-de-backup>/postgres/" 
   aws s3 cp "${DUMP}.sha256" "s3://<bucket-de-backup>/postgres/"
   ```
3. **Restringir acesso** ao bucket de backup a um usuário/role exclusivo, sem permissão para a aplicação.

### 3.4 Backups nativos do provedor

Se o provedor escolhido oferecer snapshots automáticos ou recuperação a um ponto no tempo (PITR), eles são a **camada primária**. O dump lógico acima continua útil como cópia independente do provedor e para migrar entre versões ou provedores. **A confirmar:** o provedor escolhido, se oferece snapshots/PITR e qual é a retenção padrão.

---

## 4. Frequência e retenção (recomendação, não política aprovada)

Os valores abaixo são **propostas**. A decisão final é do responsável pelo projeto.

| Tipo de backup | Frequência | Retenção sugerida | Motivo |
|---|---|---|---|
| Diário automático | 1 vez por dia, em horário de baixo tráfego (ex.: 03:00 UTC) | 30 dias | Limita a perda de dados (RPO) a até 24 horas. |
| Pré-release com migration | Antes de cada deploy que altera o schema | 30 dias (ou os últimos 10 pré-releases, o que vier primeiro) | Permite voltar ao estado anterior à migration. |
| Mensal | 1 vez por mês | 12 meses | Cobre erros descobertos tarde (ex.: dado corrompido há meses). Opcional. |

Com backup diário, o **RPO** (quantidade máxima de dados que pode ser perdida) é de até 24 horas. Se isso for insuficiente, o caminho é PITR do provedor (seção 3.4).

---

## 5. Restore

### 5.1 Princípios

- **Não restaurar por cima do banco de produção** sem antes preservar o estado atual. Restaurar em um **banco novo** é mais seguro: valide e só então troque a `DATABASE_URL`.
- Antes de qualquer restore, fazer um dump do estado atual, mesmo que esteja corrompido. Ele pode ser necessário para investigação.
- Registrar tudo em `progress.md`.

### 5.2 Fluxo

```mermaid
flowchart TD
    A[Incidente de dados] --> B[Autorização do responsável]
    B --> C[Congelar escrita: parar app e Inngest]
    C --> D[Dump do estado atual para investigação]
    D --> E[Validar checksum do backup escolhido]
    E --> F[Criar banco novo]
    F --> G[pg_restore no banco novo]
    G --> H[prisma migrate status e migrate deploy conforme versão do código]
    H --> I[prisma migrate diff com exit code]
    I --> J{Verificações OK?}
    J -- Não --> E
    J -- Sim --> K[Trocar DATABASE_URL e reativar]
    K --> L[Reconciliar dados do intervalo perdido e registrar]
```

### 5.3 Passo a passo

**1. Congelar a escrita.** Parar a aplicação e as funções Inngest, para que nenhum dado novo seja gravado durante o restore. Webhooks do Stripe e do Clerk que não forem confirmados durante a parada tendem a ser reenviados pelos provedores depois da reativação. **A confirmar:** se e por quanto tempo cada provedor faz esse reenvio.

**2. Dump de preservação do estado atual.** Mesmo comando da seção 3.2, com outro nome de arquivo.

**3. Escolher e validar o backup.**
```bash
sha256sum -c ai_podcast_clipper_<timestamp>.dump.sha256
gpg --decrypt --output ai_podcast_clipper_<timestamp>.dump ai_podcast_clipper_<timestamp>.dump.gpg
```

Listar o conteúdo antes de restaurar (confirma que o arquivo não está truncado):
```bash
pg_restore --list ai_podcast_clipper_<timestamp>.dump > /dev/null && echo "arquivo de dump legível"
```

**4. Criar um banco novo.** Pelo painel do provedor, ou via `psql` com credencial de administração:
```bash
psql "$ADMIN_DATABASE_URL" -c 'CREATE DATABASE ai_podcast_clipper_restore;'
```

**5. Restaurar no banco novo.**
```bash
pg_restore \
  --no-owner \
  --no-privileges \
  --jobs=4 \
  --dbname="$RESTORE_DATABASE_URL" \
  ai_podcast_clipper_<timestamp>.dump
```

`--jobs` exige que a entrada seja um arquivo (não pipe). Para restaurar sobre um banco que já tem objetos (não recomendado), use `--clean`. A flag `--if-exists` só é válida junto com `--clean`.

**6. Alinhar o schema às migrations do código.** Usar o código na **mesma versão** que estava em produção no momento do backup, ou na versão que vai subir após o restore.

```bash
cd ai-podcast-clipper-frontend
DATABASE_URL="$RESTORE_DATABASE_URL" npx prisma migrate status
```

- Se houver migrations **pendentes** (backup mais antigo que o código que vai subir), aplicar:
  ```bash
  DATABASE_URL="$RESTORE_DATABASE_URL" npx prisma migrate deploy
  ```
- Se o backup veio de um schema **mais novo** que o código que vai subir, **não** rodar `migrate deploy`. Alinhar a versão do código ao schema restaurado. **A confirmar** como `migrate status` se comporta nesse caso. Em caso de dúvida, parar e escalar.

**7. Verificar drift.** O schema restaurado deve bater com `prisma/schema.prisma` do código que vai subir:
```bash
DATABASE_URL="$RESTORE_DATABASE_URL" npx prisma migrate diff \
  --from-url "$RESTORE_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code
```
Exit code `0` = sem diferenças. Qualquer outro valor bloqueia a troca.

**8. Verificações de conteúdo.** Comparar contagens com o estado de produção (ou com o dump de preservação, com a diferença explicada pelo RPO):
```sql
SELECT 'User' AS tabela, COUNT(*) FROM "User"
UNION ALL SELECT 'Subscription', COUNT(*) FROM "Subscription"
UNION ALL SELECT 'CreditTransaction', COUNT(*) FROM "CreditTransaction"
UNION ALL SELECT 'UploadedFile', COUNT(*) FROM "UploadedFile"
UNION ALL SELECT 'Clip', COUNT(*) FROM "Clip";
```

Verificar também se há contas de fallback criadas pela Stripe em caso de indisponibilidade (`stripeCustomerId LIKE 'cus_fallback_%'`, ver `checklist-go-live.md`). Essas contas precisam de reconciliação manual com a Stripe.

**9. Trocar a conexão.** Atualizar `DATABASE_URL` nas env vars do frontend (Vercel), sem alterar o secret do Modal, pois o backend não acessa o banco (seção 1). Reativar a aplicação e as funções Inngest.

**10. Reconciliar o intervalo perdido.** Os dados gravados entre o último backup e o incidente se perdem. A Stripe é a fonte da verdade para pagamentos. **A confirmar:** mecanismo de reconciliação de eventos da Stripe e prazo para reenvio. Registrar em `progress.md` o intervalo afetado e o que foi feito.

**11. Limpar.** Depois de validar, remover o banco de restore temporário e registrar o procedimento.

---

## 6. Teste de restore (obrigatório periodicamente)

Um backup só existe de verdade depois que foi restaurado com sucesso. Gerar o arquivo não basta.

### 6.1 Frequência (recomendação)

- Mensal, em um banco temporário.
- Antes do go-live.
- Após qualquer mudança no processo de backup ou no provedor.

### 6.2 Como testar sem tocar em produção

Usar um Postgres temporário. O repositório já usa Postgres 16 Alpine no `docker-compose.yml`, então a imagem é a mesma:

```bash
docker run --rm -d --name restore-test \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=ai_podcast_clipper \
  -p 5433:5432 postgres:16-alpine

export RESTORE_DATABASE_URL="postgresql://postgres:postgres@localhost:5433/ai_podcast_clipper"
# seguir os passos 3 a 8 da seção 5
docker stop restore-test
```

A porta `5433` evita conflito com o Postgres de desenvolvimento (`5432`).

### 6.3 Critérios de aprovação

- `sha256sum -c` e `pg_restore --list` sem erro.
- `pg_restore` termina com exit code `0`, sem erros de objetos.
- `prisma migrate diff ... --exit-code` retorna `0`.
- Contagens das tabelas batem com a fonte (considerando o RPO).
- Tempo total de restore medido (esse número é o **RTO** real).

### 6.4 Registro do teste

| Data | Arquivo de backup | Versão do código | Resultado | Tempo de restore (RTO) | Responsável | Observações |
|---|---|---|---|---|---|---|
| _a preencher_ | | | | | | |

---

## 7. Itens que dependem do responsável

- **Provedor do Postgres de produção** e se ele oferece snapshots/PITR, com retenção conhecida.
- **Local e credenciais de armazenamento** dos backups (bucket, chave de criptografia e quem tem acesso).
- **Aprovação da frequência e da retenção** da seção 4.
- **Agendamento** do backup diário (cron do provedor, GitHub Actions ou outro). O repositório não tem nenhum agendamento hoje.
- **Prazo de reenvio de webhooks** da Stripe e do Clerk (seção 5.3, passos 1 e 10).

---

## 8. Fora do escopo deste documento

- **Objetos no S3** (vídeos originais, clipes em `clips/`). O banco guarda apenas as chaves. Um banco restaurado com clipes apontando para objetos inexistentes exige uma política própria para o bucket (ex.: versionamento). Não verificado no repositório.
- **Rollback de código e migrations:** ver `estrategia-rollback.md`.
- **Monitoramento e alertas** de falha de backup: depende do item "Observabilidade sem exportação externa" do checklist.
