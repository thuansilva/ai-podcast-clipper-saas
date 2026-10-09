# Suíte de Testes de Carga com Grafana k6

Esta pasta contém a suíte modular de testes de carga e estresse para APIs e Webhooks do Next.js.

---

## 1. Execução do Grafana k6

### Opção A: Docker (Já configurado - Recomendado)
O projeto já conta com um wrapper em `./bin/k6` que utiliza a imagem oficial `grafana/k6:latest` com rede em modo host. Você pode executar os testes diretamente com os scripts npm (`npm run test:load:*`) ou usando o Docker Compose:

```bash
# Na raiz do projeto:
docker compose run --rm k6 run load-tests/scenarios/main-suite.js
```

### Opção B: Instalação Nativa no Host (Opcional)
Se preferir instalar o binário no host:

#### Linux (Debian / Ubuntu):
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

#### macOS (Homebrew):
```bash
brew install k6
```

---

## 2. Como Executar os Testes

Certifique-se de que a aplicação Next.js esteja rodando (`npm run dev` ou `npm run start`) na porta `3000`.

### Executar via Scripts do NPM:

```bash
# 1. Teste de Sanidade Rápido (5 VUs por 30s)
npm run test:load:smoke

# 2. Teste de Carga Padrão (Rampa até 30 VUs por 2 minutos)
npm run test:load

# 3. Teste de Pico / Estresse (Pico de até 200 VUs)
npm run test:load:stress

# 4. Teste Exclusivo do Webhook do Stripe (Validação de Concorrência de Créditos)
npm run test:load:stripe

# 5. Teste Exclusivo do Fluxo de Geração de Presigned URLs S3
npm run test:load:s3
```

### Executando tudo de uma vez (modo completo)

Se você só quer rodar a suíte inteira (unitários + integração + smoke de carga)
numa única execução, sem subir manualmente Postgres/app/Inngest antes, use:

```bash
npm run test:everything
```

Esse comando (`scripts/test-everything.sh`) sobe o Postgres via Docker Compose,
builda e inicia o Next.js com env vars fake/dummy, sobe o Inngest dev server,
roda `test` → `test:integration` → `test:load:smoke` em sequência, e limpa os
processos de app/Inngest no final (o Postgres fica rodando, para reuso rápido
em execuções futuras). Ele **não** roda `test:load`/`test:load:stress` (pesados
demais para o dia a dia) — para carga pesada, rode os scripts `test:load:*`
individuais manualmente, com o app já de pé.

---

## 3. Variáveis de Ambiente Customizáveis

Você pode sobrescrever a URL base e o segredo do webhook via `--env`:

```bash
# Executando contra outro ambiente / porta
k6 run --env BASE_URL=http://localhost:3000 --env STRIPE_WEBHOOK_SECRET=whsec_... load-tests/scenarios/stripe-webhook.js
```

---

## 4. Métricas e SLAs (Thresholds)

Os testes avaliam automaticamente:
- **Taxa de Erro:** Menos de 1% de falhas HTTP (`http_req_failed < 1%`).
- **Latência p90:** 90% das requisições respondidas em menos de 150ms.
- **Latência p95:** 95% das requisições respondidas em menos de 250ms.
- **Latência p99:** 99% das requisições respondidas em menos de 500ms.
