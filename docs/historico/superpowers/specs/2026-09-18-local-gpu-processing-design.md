# Design Spec: Servidor de Processamento Local GPU Isolado

## 1. Contexto e Objetivos
Atualmente, o processamento de vídeos (transcrição via Whisper, extração de cortes e renderização via ffmpeg) é executado na nuvem utilizando o Modal (`modal.App`). Para fins de desenvolvimento e testes iterativos no ambiente local, o usuário necessita realizar esse processamento utilizando sua própria máquina (GPU local via CUDA) sem incorrer em custos na nuvem e sem alterar o código-fonte de produção que atende ao ambiente real.

## 2. Abordagem e Escopo
A abordagem selecionada foi a criação de um **Servidor FastAPI Local Isolado**.
- Será criado um script inteiramente novo: `ai-podcast-clipper-backend/local_server.py`.
- Para evitar contaminação do repositório oficial, esse arquivo será incluído imediatamente no `.gitignore`.
- Nenhuma alteração arquitetural será feita no `main.py` ou nos endpoints do Modal; o código de produção permanece intacto.

## 3. Arquitetura
- **Servidor Web:** `FastAPI` + `Uvicorn`.
- **Endpoints Expostos:**
  - `POST /process_video`: Recebe os mesmos parâmetros (Webhook do Inngest/Frontend) e processa os cortes.
  - `POST /download_youtube`: Caso a arquitetura local também necessite dividir o download, expondo a rota para manter compatibilidade com o `.env` padrão.
- **Processamento:**
  - As chamadas de IA e renderização não usarão decorators `@app.function` ou `@app.cls`.
  - Serão executadas diretamente no processo do Python, utilizando os diretórios locais para cache (`.cache` ou `tmp/`) em vez do `modal.Volume`.
  - Será necessário possuir as dependências instaladas no ambiente Python local (`ffmpegcv`, `torch`, `pysubs2`, etc).

## 4. Integração com o Frontend
O frontend continuará despachando os Jobs via Inngest de forma transparente. No `.env` local do frontend:
```env
PROCESS_VIDEO_ENDPOINT="http://localhost:8000/process_video"
YOUTUBE_DOWNLOAD_ENDPOINT="http://localhost:8000/download_youtube"
```
O Inngest usará o protocolo HTTP nativo para injetar o payload em JSON para essas rotas.

## 5. Passos de Implementação
1. Adicionar `local_server.py` no `ai-podcast-clipper-backend/.gitignore`.
2. Criar `ai-podcast-clipper-backend/local_server.py` copiando as classes, funções puras e a lógica bruta do `main.py`.
3. Remover todos os decorators (`@app.cls`, `@app.function`, `@app.local_entrypoint`).
4. Envolver as funções alvo (`download_youtube` e `process_video`) em rotas do FastAPI (`@app.post(...)`).
5. Substituir caminhos fixos de disco da nuvem (ex: `/root/.cache/torch`) para pastas de cache locais do OS.
6. Adicionar blocos de inicialização `if __name__ == "__main__": uvicorn.run(...)`.

## 6. Revisão de Segurança (Self-Review)
- **TBD/TODOs pendentes?** Nenhum. As rotas batem com a expectativa do `inngest/functions.ts` já mapeada.
- **Isolamento Confirmado:** Sim, o uso do `.gitignore` garante o escopo descartável.
- **Ambiguidade:** Como os arquivos são passados ao S3? O backend de produção provavelmente já envia para o AWS S3 configurado no `.env` com a biblioteca `boto3`. Essa parte da lógica será copiada igualmente, garantindo que o banco de dados do frontend aponte para URIs de vídeo funcionais.
