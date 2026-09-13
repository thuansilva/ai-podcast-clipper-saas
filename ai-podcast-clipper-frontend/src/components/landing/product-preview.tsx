import { PlayIcon, CheckCircle2Icon } from "lucide-react";

export function ProductPreview() {
  return (
    <section id="demonstracao" className="py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Demonstração Real</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Como a transformação acontece na prática
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Detecção inteligente de quem está falando com reenquadramento cirúrgico de 16:9 para 9:16.
          </p>
        </div>

        {/* Frame de Demonstração */}
        <div className="mt-10 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4 backdrop-blur-sm sm:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            {/* Lado Esquerdo: Vídeo Horizontal Original + Detecção */}
            <div className="space-y-4 lg:col-span-6">
              <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
                <span className="font-mono text-xs text-zinc-400">VÍDEO FONTE (YOUTUBE 16:9)</span>
                <span className="font-mono text-xs text-zinc-500">01:14:30 TOTAL</span>
              </div>

              {/* Simulação do Player Horizontal Original */}
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/50">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800/80">
                    <PlayIcon className="h-5 w-5 text-zinc-300 ml-0.5" />
                  </div>
                  <span className="mt-3 font-mono text-xs text-zinc-400">Episódio #42 - Estratégias de Escala</span>
                </div>

                {/* Caixa delimitadora de detecção do orador */}
                <div className="absolute top-1/4 left-1/4 h-1/2 w-1/4 rounded border border-amber-500/80 bg-amber-500/10">
                  <span className="absolute -top-5 left-0 rounded bg-amber-500 px-1 font-mono text-[9px] font-bold text-zinc-950">
                    ORADOR ATIVO
                  </span>
                </div>
              </div>

              {/* Timeline de Análise de Picos */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-1.5">
                <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                  <span>Segmento identificado pelo algoritmo:</span>
                  <span className="text-zinc-200">00:14:22 → 00:15:08</span>
                </div>
                <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-zinc-300 w-3/4 ml-[15%]" />
                </div>
                <p className="text-[11px] text-zinc-500">Gatilho detectado: Alta intensidade vocal e retenção sem pausas mortas.</p>
              </div>
            </div>

            {/* Lado Direito: O Corte Vertical Final (9:16) */}
            <div className="flex flex-col items-center lg:col-span-6">
              <div className="w-full max-w-[280px] space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <span className="font-mono text-xs text-zinc-400">CORTE FINAL (VERTICAL 9:16)</span>
                  <span className="rounded bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                    Score Viral: 94/100
                  </span>
                </div>

                {/* Visual do Smartphone 9:16 */}
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border-2 border-zinc-800 bg-zinc-950 shadow-2xl">
                  {/* Simulação da cena do corte vertical */}
                  <div className="absolute inset-0 flex flex-col justify-between p-4">
                    {/* Topo do corte */}
                    <div className="flex items-center justify-between">
                      <span className="rounded bg-black/60 px-2 py-1 font-mono text-[10px] text-zinc-300 backdrop-blur-sm">
                        00:46s
                      </span>
                      <span className="font-mono text-[10px] text-red-400 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> REC
                      </span>
                    </div>

                    {/* Legenda Dinâmica no Centro/Inferior */}
                    <div className="my-auto text-center px-2">
                      <p className="text-sm font-extrabold uppercase tracking-wide text-zinc-100 drop-shadow-md">
                        O maior segredo <br />
                        <span className="bg-amber-400 text-zinc-950 px-1 py-0.5 rounded">NUNCA</span> é revelado!
                      </p>
                    </div>

                    {/* Rodapé do corte */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                        <CheckCircle2Icon className="h-3 w-3" />
                        Pronto para TikTok & Reels
                      </div>
                      <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-zinc-100 w-2/3" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
