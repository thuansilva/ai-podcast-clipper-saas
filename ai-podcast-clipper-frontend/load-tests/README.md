# Suíte de Testes de Carga com Grafana k6

Esta pasta contém a suíte modular de testes de carga e estresse para APIs e Webhooks do Next.js.

---

## 1. Instalação do Grafana k6

### Linux (Debian / Ubuntu):
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### macOS (Homebrew):
```bash
brew install k6
```

### Binário Direto (Qualquer OS):
Baixe diretamente do repositório oficial: [github.com/grafana/k6/releases](https://github.com/grafana/k6/releases)

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
