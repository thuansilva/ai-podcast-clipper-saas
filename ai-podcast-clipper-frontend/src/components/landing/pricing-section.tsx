import Link from "next/link";
import { CheckIcon, ZapIcon } from "lucide-react";

export interface PricingSectionProps {
  isAuthenticated: boolean;
}

export function PricingSection({ isAuthenticated }: PricingSectionProps) {
  const targetHref = isAuthenticated ? "/dashboard/billing" : "/signup";

  const plans = [
    {
      title: "Pack Inicial",
      price: "$9.99",
      approxBrl: "~R$ 50",
      credits: "50 créditos",
      description: "Ideal para testar em um episódio completo de podcast.",
      features: [
        "50 minutos de processamento",
        "Download de todos os cortes em 1080p",
        "Detecção facial ativa em 9:16",
        "Legendas automáticas sincronizadas",
        "Créditos que nunca expiram",
      ],
      isPopular: false,
      ctaText: "Comprar 50 Créditos",
    },
    {
      title: "Pack Criador",
      price: "$24.99",
      approxBrl: "~R$ 130",
      credits: "150 créditos",
      description: "O melhor custo-benefício para canais com episódios regulares.",
      features: [
        "150 minutos de processamento (~3 episódios)",
        "Economia de 17% por crédito",
        "Download ilimitado de cortes",
        "Prioridade na fila de renderização",
        "Créditos que nunca expiram",
      ],
      isPopular: true,
      ctaText: "Comprar 150 Créditos",
    },
    {
      title: "Pack Estúdio",
      price: "$69.99",
      approxBrl: "~R$ 380",
      credits: "500 créditos",
      description: "Para agências de mídia e podcasts de alta frequência semanal.",
      features: [
        "500 minutos de processamento (~10 episódios)",
        "Economia de 30% por crédito",
        "Fila de processamento ultra rápida",
        "Suporte técnico prioritário",
        "Créditos que nunca expiram",
      ],
      isPopular: false,
      ctaText: "Comprar 500 Créditos",
    },
  ];

  return (
    <section id="precos" className="border-t border-zinc-800/60 py-20 bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Preços Transparentes</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Pague pelo que usar. Sem mensalidade forçada.
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Compre créditos quando precisar. Créditos nunca expiram e ficam salvos na sua conta.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`relative flex flex-col justify-between rounded-xl border p-6 transition-all ${
                plan.isPopular
                  ? "border-zinc-500 bg-zinc-900/60 shadow-xl"
                  : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700"
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-zinc-600 bg-zinc-100 px-3 py-0.5 font-mono text-[10px] font-semibold text-zinc-950 uppercase tracking-wider">
                  Mais Popular
                </div>
              )}

              <div>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-lg font-semibold text-zinc-100">{plan.title}</h3>
                  <span className="font-mono text-xs text-zinc-400">{plan.credits}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{plan.description}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tracking-tight text-zinc-100">{plan.price}</span>
                  <span className="font-mono text-xs text-zinc-500">{plan.approxBrl}</span>
                </div>

                <div className="my-6 border-t border-zinc-800/80" />

                <ul className="space-y-2.5 text-xs text-zinc-300">
                  {plan.features.map((feat, fIdx) => (
                    <li key={fIdx} className="flex items-center gap-2">
                      <CheckIcon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-8">
                <Link
                  href={targetHref}
                  className={`flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-xs font-medium transition-colors ${
                    plan.isPopular
                      ? "bg-zinc-100 text-zinc-950 hover:bg-zinc-200"
                      : "border border-zinc-800 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <ZapIcon className="h-3.5 w-3.5" />
                  {plan.ctaText}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
