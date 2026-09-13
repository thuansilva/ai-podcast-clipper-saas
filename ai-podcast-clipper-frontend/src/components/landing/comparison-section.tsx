import { CheckIcon, XIcon } from "lucide-react";

export function ComparisonSection() {
  const comparisons = [
    {
      metric: "Tempo por Episódio",
      manual: "3 a 5 horas caçando timecodes e cortando",
      clipper: "Menos de 3 minutos automatizados",
    },
    {
      metric: "Custo Médio por Corte",
      manual: "R$ 50 a R$ 150 com editor freelancer",
      clipper: "Menos de R$ 1,00 por corte finalizado",
    },
    {
      metric: "Reenquadramento 9:16",
      manual: "Keyframes manuais para cada orador",
      clipper: "Detecção facial e troca de câmera automática",
    },
    {
      metric: "Legendas Dinâmicas",
      manual: "Digitação manual e ajuste de sync",
      clipper: "Transcrição precisa em português sincronizada",
    },
    {
      metric: "Frequência de Postagem",
      manual: "2 a 3 cortes por semana com esforço",
      clipper: "10 a 20 cortes semanais sem sobrecarga",
    },
  ];

  return (
    <section id="comparativo" className="border-t border-zinc-800/60 py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Eficiência & ROI</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Edição Manual vs. Podcast Clipper
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Pare de perder dias na timeline do editor. Publique com consistência sem aumentar seu custo.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
          <div className="grid grid-cols-1 md:grid-cols-12 border-b border-zinc-800 bg-zinc-900/50 p-4 font-mono text-xs text-zinc-400">
            <div className="md:col-span-4 font-semibold uppercase">Critério</div>
            <div className="hidden md:block md:col-span-4 uppercase text-zinc-500">Edição Manual Tradicional</div>
            <div className="hidden md:block md:col-span-4 uppercase text-zinc-200">Com o Podcast Clipper</div>
          </div>

          <div className="divide-y divide-zinc-800/60">
            {comparisons.map((item, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 p-4 text-sm gap-2 md:gap-0 items-center">
                <div className="md:col-span-4 font-medium text-zinc-200">{item.metric}</div>
                <div className="md:col-span-4 flex items-center gap-2 text-zinc-400">
                  <XIcon className="h-4 w-4 text-zinc-600 shrink-0" />
                  <span className="text-xs sm:text-sm">{item.manual}</span>
                </div>
                <div className="md:col-span-4 flex items-center gap-2 text-zinc-100 font-medium">
                  <CheckIcon className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-xs sm:text-sm">{item.clipper}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
