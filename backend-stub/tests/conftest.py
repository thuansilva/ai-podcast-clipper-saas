import sys
from pathlib import Path

# schemas.py e otel_setup.py são copiados de ai-podcast-clipper-backend/core/
# na imagem Docker (ver ../Dockerfile) — não duplicados à mão. Pra rodar os
# testes localmente sem Docker, sem duplicar esses arquivos, apontamos o
# sys.path pra lá.
BACKEND_STUB_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_STUB_DIR.parent
CORE_DIR = REPO_ROOT / "ai-podcast-clipper-backend" / "core"

sys.path.insert(0, str(BACKEND_STUB_DIR))
sys.path.insert(0, str(CORE_DIR))
