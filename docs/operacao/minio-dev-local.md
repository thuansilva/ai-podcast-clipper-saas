# MinIO para Desenvolvimento Local

**Escopo:** subir um storage S3-compatível gratuito na sua máquina para desenvolvimento e testes, sem usar o AWS S3 real.
**Verificado em:** 2026-10-10 (execução real de `docker compose`, `docker manifest inspect`, boto3 contra o servidor local).
**Relacionados:** `./aws-s3-lifecycle-rules.md` (regras de ciclo de vida do S3 real), `../arquitetura/visao-fluxo-processamento-video.md` (seção "Armazenamento: porta `ObjectStorage`"), RF-PIPE-12 e RNF-SEC-17 em `../requisitos/requisitos-funcionais-e-nao-funcionais.md`.

---

## 1. Quando usar

| Situação | MinIO local? |
|----------|--------------|
| Desenvolver frontend/backend sem gastar com S3 real | Sim |
| Rodar os testes que tocam storage real (`pytest -m minio`, `s3-storage.minio.integration.test.ts`) | Sim |
| Processar vídeo com o `local_server.py` (GPU local) | Sim |
| Processar vídeo no **Modal** (nuvem) | **Não** — ver seção 6 |
| Produção | **Não** — produção usa AWS S3 real (sem `S3_ENDPOINT_URL`) |

---

## 2. Como subir

Na raiz do monorepo:

```bash
docker compose up -d minio minio-init
docker compose logs minio-init
```

- `minio` é o servidor (API S3 e console). Fica `healthy` quando o endpoint `/minio/health/live` responde 200.
- `minio-init` é um container **one-shot** (`restart: "no"`) que cria o bucket do projeto e o usuário restrito da aplicação. Ao terminar com sucesso, o log termina com:
  `minio-init concluido: bucket=ai-podcast-clipper usuario=ai-podcast-clipper-app`
- O script `ai-podcast-clipper-frontend/scripts/test-everything.sh` já sobe os dois serviços sozinho.

**Verificado (2026-10-10):** `minio` com status `healthy`, `minio-init` com `ExitCode 0`, `GET http://localhost:9000/minio/health/live` = 200.

---

## 3. Portas

| Porta | Uso | Verificação |
|-------|-----|-------------|
| `9000` | API S3 (`http://localhost:9000`) | `/minio/health/live` retorna 200 |
| `9001` | Console web (`http://localhost:9001`) | `GET /` retorna 200 |

O console faz login com o **usuário root** (`MINIO_ROOT_USER`). Use-o só para administração manual; a aplicação nunca usa esse usuário.

---

## 4. Credenciais e variáveis

Todas as variáveis abaixo vêm do `docker-compose.yml`, com os defaults de desenvolvimento. Para trocar, defina a variável no ambiente do shell ou em um `.env` na raiz (o Compose lê automaticamente).

| Papel | Variável (compose) | Default | Quem usa |
|-------|--------------------|---------|----------|
| Root (bootstrap/admin) | `MINIO_ROOT_USER` | `minioadmin` | Serviços `minio` e `minio-init`. Os testes também usam por default (`TEST_MINIO_ACCESS_KEY`/`TEST_MINIO_SECRET_KEY`, ver `ai-podcast-clipper-backend/tests/minio_support.py`). **Não é usado pela aplicação.** |
| Root (senha) | `MINIO_ROOT_PASSWORD` | `minioadmin` | idem |
| **Usuário da aplicação** | `MINIO_APP_ACCESS_KEY` | `ai-podcast-clipper-app` | Valor de `AWS_ACCESS_KEY_ID` no frontend e no backend |
| **Senha da aplicação** | `MINIO_APP_SECRET_KEY` | `ai-podcast-clipper-app-secret123` | Valor de `AWS_SECRET_ACCESS_KEY` no frontend e no backend |
| Bucket | `MINIO_APP_BUCKET` | `ai-podcast-clipper` | Valor de `S3_BUCKET_NAME` |
| CORS (browser) | `MINIO_API_CORS_ALLOW_ORIGIN` | `http://localhost:3000` | Origem permitida no upload direto pelo browser (PUT via URL pré-assinada) |

### Permissões do usuário da aplicação

A policy `ai-podcast-clipper-rw` (criada pelo `minio-init`) concede `s3:*` **somente** no bucket do projeto. Comportamento observado em 2026-10-10, com `boto3` usando as credenciais da aplicação:

| Operação | Resultado |
|----------|-----------|
| `put_object` / `delete_object` no bucket `ai-podcast-clipper` | Permitido |
| `put_object` em outro bucket | `AccessDenied` |
| `list_buckets` | **Permitido** (o MinIO lista nomes de buckets para qualquer usuário autenticado; a policy não bloqueia `ListAllMyBuckets`). Não expõe conteúdo, mas não é "zero privilégio" total. |

### Variáveis para apontar frontend/backend para o MinIO

```bash
STORAGE_PROVIDER=s3
S3_ENDPOINT_URL=http://localhost:9000      # de dentro de outro container da mesma rede compose: http://minio:9000
S3_BUCKET_NAME=ai-podcast-clipper
AWS_REGION=us-east-1                       # MinIO aceita qualquer região; mantido igual ao default do projeto
AWS_ACCESS_KEY_ID=ai-podcast-clipper-app
AWS_SECRET_ACCESS_KEY=ai-podcast-clipper-app-secret123
```

- `STORAGE_PROVIDER=local` é outra opção (sem rede, copia arquivos no disco). Não é MinIO.
- Os valores de `AWS_*` que estiverem no `.env` do backend são responsabilidade de quem configura o ambiente; não os substitua por credenciais reais do AWS sem necessidade.

---

## 5. Testes que dependem do MinIO

| Suíte | Comando | Comportamento sem MinIO |
|-------|---------|-------------------------|
| Backend, só MinIO | `cd ai-podcast-clipper-backend && .venv/bin/python -m pytest -m minio` | Testes marcados `minio` pulam com motivo claro quando o servidor não responde (conforme docstring de `tests/minio_support.py`). Falha de autenticação **não** é pulada — falha, por ser erro de configuração real. |
| Backend, sem MinIO | `.venv/bin/python -m pytest -m "not minio"` | Não depende do servidor |
| Frontend, integração | `npm run test:integration` (em `ai-podcast-clipper-frontend/`) | `tests/integration/storage/s3-storage.minio.integration.test.ts` exige o servidor no ar |

O bucket usado pelos testes é `ai-podcast-clipper-test` (criado pelos próprios testes se faltar), separado do bucket de desenvolvimento `ai-podcast-clipper`.

---

## 6. Limitação: o Modal não alcança o MinIO local

O Modal roda o processamento na **nuvem** (`ai-podcast-clipper-backend/main.py`). Um endpoint `http://localhost:9000` não existe para ele: qualquer `S3_ENDPOINT_URL` com `localhost` faz o pipeline falhar no Modal.

Consequências:

- O MinIO local serve ao **`local_server.py`** (GPU local) e ao **frontend em desenvolvimento**.
- Para processar com o Modal, use o AWS S3 real (ou um endpoint S3-compatível publicamente acessível com HTTPS), sem `S3_ENDPOINT_URL` de dev.
- Proteção atual: o frontend recusa `S3_ENDPOINT_URL` de dev quando `NODE_ENV=production` (`src/infrastructure/storage/storage-endpoint-guard.ts`). **O backend ainda não tem essa checagem** (`core/storage/factory.py` aceita `S3_ENDPOINT_URL` em qualquer ambiente). Risco registrado em `../operacao/checklist-go-live.md`, seção "Riscos de Configuração e Ambiente" (`RNF-SEC-17`).

---

## 7. Por que a imagem é a Chainguard e não `minio/minio`

O serviço usa `cgr.dev/chainguard/minio`, fixada pelo **digest** `sha256:7df55d002b698e4494a131b848dd553361bbe58b7e19f62d9623c29af1ba9ccf`.

**Evidência observada em 2026-10-10:**

| Imagem | Resultado de `docker manifest inspect` |
|--------|----------------------------------------|
| `minio/minio:latest` (Docker Hub) | `denied: requested access to the resource is denied` / `unauthorized` — **não acessível** |
| `quay.io/minio/minio:latest` e tags `RELEASE.*` testadas | `no such manifest` — **inconclusivo**. Não é o mesmo erro de "denied" que o comentário do compose descreve; não use o quay.io como alternativa sem checar antes |
| `cgr.dev/chainguard/minio:latest` | Acessível |
| `cgr.dev/chainguard/minio:2026-09-22` (tag datada) | `MANIFEST_UNKNOWN` — indisponível para este acesso. O compose atribui isso ao plano gratuito da Chainguard, causa que não foi verificada aqui |

**Contexto de licenciamento (fontes de terceiros, não confirmadas no site oficial da MinIO nesta tarefa):** relatos publicados indicam que a MinIO deixou de distribuir imagens gratuitas da Community Edition no Docker Hub, e que o projeto entrou em modo de manutenção. Fontes consultadas: [MinIO CE in 2026: Retired Upstream, Source-Only, and What to Use](https://glukhov.org/data-infrastructure/object-storage/minio-dead/), [The end of free MinIO](https://community.ataccama.com/data-quality-catalog-94/the-end-of-free-minio-explaining-recent-regressions-and-missing-features-in-ataccama-one-2369), [madewithlove: Thanks for all the buckets](https://madewithlove.com/blog/thanks-for-all-the-buckets/). As fontes divergem sobre o quay.io; por isso o quay não é citado como alternativa aqui.

**Por que o digest:** tag `latest` é mutável; o digest é imutável. Para trocar a versão, altere o digest de forma deliberada em **dois** lugares do compose (`minio` e `minio-init`), que compartilham a mesma imagem.

**Versão empacotada no digest atual:** `RELEASE.2026-09-22T19-25-18Z` (`minio --version` executado dentro da imagem). A imagem também traz o `mc` (cliente), que o `minio-init` usa — por isso não há um serviço `minio/mc` separado.

**Atenção:** o MinIO é distribuído sob a licença AGPLv3 (informação de conhecimento geral, não reverificada nesta tarefa). Esta imagem é para desenvolvimento local; antes de qualquer uso fora de dev, revise as obrigações de licença com o responsável jurídico.

---

## 8. Limpeza e ciclo de vida

- Os dados ficam no volume Docker `minio_data` (nome final `<projeto>_minio_data`, conforme o nome do projeto Compose). Para zerar o MinIO local, pare e remova os containers e depois o volume:
  ```bash
  docker compose rm -sf minio minio-init
  docker volume ls --format '{{.Name}}' | grep minio_data   # confira o nome exato
  docker volume rm <nome-do-volume-listado>
  ```
  Isso apaga todos os objetos do bucket de desenvolvimento.
- A regra de expiração de `uploads/` e `youtube/` em 1 dia (ver `./aws-s3-lifecycle-rules.md`) **não** é automática aqui. O compose documenta o comando manual para quem precisar:
  `docker compose exec minio-init mc ilm rule add --expire-days 1 --prefix "uploads/" local/ai-podcast-clipper` (e o mesmo para `youtube/`). Esse comando não foi executado nesta tarefa e não é idempotente: rode uma vez só.
