"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs: FAQItem[] = [
    {
      question: "Como funcionam os créditos?",
      answer:
        "1 crédito equivale a 1 minuto de vídeo analisado e fatiado. Por exemplo, um episódio de 45 minutos consome 45 créditos e gera de 3 a 7 cortes verticais de alta retenção prontos para publicação.",
    },
    {
      question: "Os créditos expiram se eu não usar este mês?",
      answer:
        "Não. Nossos pacotes são pay-as-you-go. Os créditos adquiridos nunca expiram e permanecem na sua conta até que você decida utilizá-los no seu próximo episódio.",
    },
    {
      question: "O reconhecimento de fala funciona com podcasts em português?",
      answer:
        "Sim. Nosso modelo de transcrição foi calibrado especificamente com foco em português do Brasil, lidando com gírias, termos técnicos de negócios e sobreposição de falas com alta acurácia.",
    },
    {
      question: "Quais links de vídeo posso importar?",
      answer:
        "Você pode colar links públicos ou não listados do YouTube, ou fazer upload direto de arquivos de vídeo MP4 e MOV salvos no seu computador.",
    },
    {
      question: "Como funciona a garantia e o suporte?",
      answer:
        "Todo novo usuário ganha 10 créditos gratuitos para testar a qualidade antes de comprar qualquer pacote. Se tiver qualquer dúvida ou problema com um corte, nossa equipe de suporte responde diretamente.",
    },
  ];

  return (
    <section id="faq" className="border-t border-zinc-800/60 py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <span className="font-mono text-xs tracking-wider text-zinc-400 uppercase">Tire suas dúvidas</span>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
            Perguntas Frequentes
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Respostas diretas sobre processamento, cobrança e suporte.
          </p>
        </div>

        <div className="mt-10 space-y-3">
          {faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950 transition-colors hover:border-zinc-700"
              >
                <button
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between p-4 text-left text-sm font-medium text-zinc-200 transition-colors hover:text-white"
                  aria-expanded={isOpen}
                >
                  <span>{faq.question}</span>
                  <ChevronDownIcon
                    className={`h-4 w-4 text-zinc-400 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-zinc-200" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-zinc-800/60 px-4 py-3 text-xs leading-relaxed text-zinc-400 bg-zinc-900/30">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
