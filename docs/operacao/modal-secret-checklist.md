# Checklist do Secret do Modal (`ai-podcast-clipper-secret`)

> Criado em 2026-10-11 para fechar o item HIGH "Secret do Modal sem checklist
> documentado" (`checklist-go-live.md`). Levantado por leitura de `main.py`,
> `local_server.py`, `core/storage/factory.py`, `core/moments_factory.py` e
> `core/claude_moments.py` — não é uma lista teórica, é o que o código
> efetivamente lê via `os.environ`/`env.get(...)`.

## Onde isso é usado

`main.py` (app Modal) injeta este secret em cada função decorada com
`@app.function(...)`:

```python
secrets=[modal.Secret.from_name("ai-podcast-clipper-secret")],
```

As variáveis abaixo precisam existir nesse secret (`modal secret create
ai-podcast-clipper-secret ...` ou via dashboard do Modal) antes de qualquer
`modal deploy main.py` em produção real. `local_server.py` lê as mesmas
variáveis de um `.env`/ambiente local (não do secret do Modal).

## Variáveis obrigatórias

| Variável | Usada em | O que acontece se faltar |
|---|---|---|
| `AUTH_TOKEN` | `main.py::process_video`/`download_youtube` (comparação `hmac.compare_digest`), `local_server.py::verify_auth_token` | Token ausente/vazio → **401 explícito** em toda chamada (RNF-SEC-07, resolvido 2026-10-09). O processo sobe, mas nenhuma chamada autenticada funciona — efetivamente um backend inutilizável, não uma falha silenciosa. |
| `GEMINI_API_KEY` | `main.py`/`local_server.py` (cliente `genai.Client`, usado como provider de momentos default e sempre instanciado) | **Fallback silencioso:** o código usa `os.environ.get("GEMINI_API_KEY", "dummy_key")` ao construir o cliente, então o processo sobe sem erro. A falha só aparece na primeira chamada real ao Gemini (erro de autenticação da API), em runtime — gap conhecido, já registrado no checklist (item MEDIUM de `MOMENTS_PROVIDER`). Obrigatória de fato quando `MOMENTS_PROVIDER` é `gemini` (default) ou omitido. |
| `AWS_ACCESS_KEY_ID` | Lido automaticamente pelo `boto3` (cadeia de credenciais padrão), não há leitura explícita em `core/storage/factory.py` | boto3 tenta outras fontes de credenciais (IAM role, etc.); num container Modal sem role, toda chamada S3 falha com erro de credenciais na primeira operação (não no boot). |
| `AWS_SECRET_ACCESS_KEY` | Idem (par da anterior) | Idem. |
| `S3_BUCKET_NAME` | `core/storage/factory.py::create_object_storage` (`env.get("S3_BUCKET_NAME", DEFAULT_BUCKET)`) | **Fallback silencioso** para `"ai-podcast-clipper"` (`DEFAULT_BUCKET`). Só é um problema se o bucket real de produção tiver outro nome — nesse caso toda operação de storage aponta para o bucket errado/inexistente. |

## Variáveis obrigatórias condicionalmente

| Variável | Obrigatória quando | O que acontece se faltar |
|---|---|---|
| `STORAGE_PROVIDER` | Sempre lida, mas tem default seguro para produção | Default `"s3"` (AWS real) — **correto para produção**, não precisa ser setada explicitamente. Só precisa setar se for usar `"minio"` (não deveria ser o caso em produção real; ver `S3_ENDPOINT_URL`/`APP_ENV` abaixo). Qualquer valor fora de `"s3"`/`"minio"` → `ValueError` no boot da factory (processo não sobe). |
| `APP_ENV` | Recomendado sempre `"production"` no secret do Modal | **Nova variável (2026-10-11, RNF-SEC-17)** — não existia antes neste backend; decisão deste grupo de trabalho, documentada aqui e aberta a revisão. Só importa quando `STORAGE_PROVIDER="minio"`: com `APP_ENV="production"`, `core/storage/factory.py` valida que `S3_ENDPOINT_URL` é um host público em `https://` (rejeita `localhost`/IP privado/link-local/nome interno/hostname sem domínio) e levanta `ValueError` no boot se não for. Sem `APP_ENV` (ou `APP_ENV` != `"production"`), o guard fica desativado — comportamento permissivo de dev. **Se `STORAGE_PROVIDER="s3"` (o caso normal de produção), `APP_ENV` não tem efeito algum** (a branch `"s3"` nunca aceita `S3_ENDPOINT_URL`), mas setá-la mesmo assim é a prática recomendada: é a única forma de o guard pegar o erro de configuração se alguém trocar para `"minio"` por engano no futuro. |
| `S3_ENDPOINT_URL` | Só se `STORAGE_PROVIDER="minio"` | Com `STORAGE_PROVIDER="minio"`: ausente/vazio → `ValueError` no boot. Com `STORAGE_PROVIDER="s3"`: **não deve existir** — setá-la por engano (ex. herdada do ambiente de dev local, `http://localhost:9000`) → `ValueError` no boot ("STORAGE_PROVIDER=\"s3\" does not accept S3_ENDPOINT_URL"). Esse é exatamente o cenário de risco que motivou o guard de `APP_ENV`. |
| `AWS_REGION` | Opcional | Omitida → nenhum `region_name=` é passado ao `boto3.client`; a região é resolvida por outra via do boto3 (ou cai no default `us-east-1`). Não é um erro, mas pode apontar para a região errada silenciosamente. |
| `MOMENTS_PROVIDER` | Opcional (default `"gemini"`) | Valor fora de `"gemini"`/`"claude"` → `ValueError` no boot de `create_moments_provider` (`core/moments_factory.py`). |
| `ANTHROPIC_API_KEY` | Obrigatória só se `MOMENTS_PROVIDER="claude"` | Com `MOMENTS_PROVIDER="claude"` e chave ausente/vazia → `ValueError` no boot ("MOMENTS_PROVIDER=\"claude\" requires ANTHROPIC_API_KEY..."). Com `MOMENTS_PROVIDER="gemini"` (default), esta variável é ignorada. |
| `CLAUDE_MODEL` | Opcional | Fallback silencioso para `"claude-sonnet-5-5"` (`core/claude_moments.py`). Só relevante quando `MOMENTS_PROVIDER="claude"`. |

## Variáveis de observabilidade (opcionais, fora deste secret por convenção)

| Variável | Usada em | O que acontece se faltar |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` (ou `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`) | `core/otel_setup.py::setup_otel` — `OTLPSpanExporter()` sem argumento, lida automaticamente pelo SDK do OTel (nunca hardcoded no código) | Fallback silencioso do próprio SDK (tenta `http://localhost:4318` por padrão) — em produção no Modal isso nunca é alcançável, então os spans são gerados e descartados ao tentar exportar (falha de export, não de boot). Não é um `ValueError`; é um gap de observabilidade, não de disponibilidade do pipeline. Ver `docs/operacao/observabilidade.md`. |

## Resumo rápido para quem vai configurar o secret agora

Mínimo para produção real (S3 + Gemini):

```
AUTH_TOKEN=<token forte>
GEMINI_API_KEY=<chave real>
AWS_ACCESS_KEY_ID=<chave real>
AWS_SECRET_ACCESS_KEY=<chave real>
AWS_REGION=<região real, ex. us-east-1>
S3_BUCKET_NAME=<bucket real>
STORAGE_PROVIDER=s3
APP_ENV=production
```

Nunca incluir `S3_ENDPOINT_URL` nesse secret — é exclusivo do MinIO de
desenvolvimento local (`docker-compose.yml`). Se algum dia for necessário um
MinIO/S3-compatível auto-hospedado em produção real (`STORAGE_PROVIDER=minio`),
`S3_ENDPOINT_URL` precisa ser um host público em `https://` — com
`APP_ENV=production` setada, qualquer outro valor falha no boot em vez de
falhar silenciosamente em runtime.

Se usar Claude em vez de Gemini para identificação de momentos, trocar/adicionar:

```
MOMENTS_PROVIDER=claude
ANTHROPIC_API_KEY=<chave real>
CLAUDE_MODEL=<opcional, default claude-sonnet-5-5>
```
