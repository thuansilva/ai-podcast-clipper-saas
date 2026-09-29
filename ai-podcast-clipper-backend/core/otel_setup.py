"""Setup de OpenTelemetry compartilhado pelos endpoints FastAPI deste backend.

Usado tanto pelo backend real (main.py, roda no Modal) quanto pelo stub local
(backend-stub/), com a MESMA lógica — só muda o service_name. O endpoint do
collector nunca é hardcoded aqui: OTLPSpanExporter() sem argumento lê
OTEL_EXPORTER_OTLP_ENDPOINT (ou OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) do
ambiente, convenção padrão do SDK do OTel — em produção no Modal, isso vem de
um secret; localmente, do docker-compose/`.env`.
"""

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

_instrumented = False


def setup_otel(service_name: str) -> None:
    """Configura o TracerProvider global e instrumenta FastAPI globalmente.

    Usa FastAPIInstrumentor().instrument() (monkeypatch em fastapi.FastAPI),
    não instrument_app(app) — necessário aqui porque o Modal cria a
    instância do FastAPI por trás de @modal.fastapi_endpoint, então não há
    um objeto `app` acessível pra instrumentar diretamente; o mesmo vale
    para o stub, que também usa uma factory por request de teste.

    Idempotente: seguro chamar mais de uma vez no mesmo processo (ex.: se
    múltiplos módulos de teste importam main.py).
    """
    global _instrumented
    if _instrumented:
        return

    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor().instrument()
    _instrumented = True
