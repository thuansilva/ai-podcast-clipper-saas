"use client";

import { useEffect, useState } from "react";
import { ArrowLeftIcon, CheckIcon, Coins, Layers, Zap } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  createCheckoutSession,
  getUserBillingData,
  type PriceId,
  type UserBillingData,
} from "~/actions/stripe";
import { ActiveSubscriptionCard } from "~/components/billing/active-subscription-card";
import {
  PricingToggleTabs,
  type PricingTab,
} from "~/components/billing/pricing-toggle-tabs";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { cn } from "~/lib/utils";

interface PricingPlan {
  title: string;
  price: string;
  period?: string;
  strikethroughPrice?: string;
  description: string;
  features: string[];
  buttonText: string;
  isPopular?: boolean;
  savePercentage?: string;
  priceId: PriceId;
}

const monthlyPlans: PricingPlan[] = [
  {
    title: "Creator",
    price: "$19.99",
    period: "/ mês",
    description: "Ideal para criadores de podcast em crescimento",
    features: [
      "150 créditos (~2h30) renovados todo mês",
      "Rastreamento facial inteligente (LR-ASD)",
      "Legendas dinâmicas 1080p 60fps",
      "Download de todos os clipes",
    ],
    buttonText: "Assinar Creator",
    priceId: "creator",
  },
  {
    title: "Pro Studio",
    price: "$49.99",
    period: "/ mês",
    strikethroughPrice: "$79.99",
    description: "Máxima performance e prioridade para estúdios e agências",
    features: [
      "500 créditos (~8h20) renovados todo mês",
      "Fila prioritária GPU Ultra (máxima velocidade)",
      "Apenas $0,10 por minuto de vídeo",
      "Rastreamento facial inteligente (LR-ASD)",
      "Legendas dinâmicas 1080p 60fps",
      "Suporte prioritário 24/7",
    ],
    buttonText: "Assinar Pro Studio",
    isPopular: true,
    savePercentage: "Economize 38%",
    priceId: "pro_studio",
  },
];

const oneTimePacks: PricingPlan[] = [
  {
    title: "Small Pack",
    price: "$9.99",
    description: "Perfeito para criadores eventuais de podcast",
    features: [
      "50 créditos avulsos",
      "Sem mensalidade / Nunca expiram",
      "Download de todos os clipes",
    ],
    buttonText: "Comprar 50 créditos",
    priceId: "small",
  },
  {
    title: "Medium Pack",
    price: "$24.99",
    description: "Melhor custo-benefício para podcasters regulares",
    features: [
      "150 créditos avulsos",
      "Sem mensalidade / Nunca expiram",
      "Download de todos os clipes",
    ],
    buttonText: "Comprar 150 créditos",
    isPopular: true,
    savePercentage: "Economize 17%",
    priceId: "medium",
  },
  {
    title: "Large Pack",
    price: "$69.99",
    description: "Ideal para estúdios de podcast e agências",
    features: [
      "500 créditos avulsos",
      "Sem mensalidade / Nunca expiram",
      "Download de todos os clipes",
    ],
    buttonText: "Comprar 500 créditos",
    savePercentage: "Economize 30%",
    priceId: "large",
  },
];

function PricingCard({ plan }: { plan: PricingPlan }) {
  const handleCheckout = async () => {
    try {
      await createCheckoutSession(plan.priceId);
    } catch {
      toast.error("Erro ao iniciar sessão de checkout. Tente novamente.");
    }
  };

  return (
    <Card
      className={cn(
        "relative flex flex-col justify-between rounded-2xl border p-6 transition-all duration-200",
        plan.isPopular
          ? "border-[var(--ouro)] bg-gradient-to-b from-[var(--superficie-2)] to-[var(--superficie)] shadow-[0_0_35px_rgba(232,186,82,0.14)]"
          : "border-[var(--linha)] bg-[var(--superficie)] hover:border-[var(--linha-2)] hover:bg-[var(--superficie-2)]",
      )}
    >
      {plan.isPopular && (
        <div className="bg-[var(--ouro)] text-[var(--tinta)] absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider shadow-sm">
          Mais Popular
        </div>
      )}

      <CardHeader className="flex-1 p-0 pb-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-[var(--marfim)]">
            {plan.title}
          </CardTitle>
          {plan.savePercentage && (
            <span className="rounded-full bg-[var(--patina)]/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--patina)]">
              {plan.savePercentage}
            </span>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-1.5">
          {plan.strikethroughPrice && (
            <span className="line-through text-lg font-normal text-[var(--fumaca)]">
              {plan.strikethroughPrice}
            </span>
          )}
          <span className="text-4xl font-bold text-[var(--marfim)]">
            {plan.price}
          </span>
          {plan.period && (
            <span className="text-xs text-[var(--fumaca)] font-medium">
              {plan.period}
            </span>
          )}
        </div>

        <CardDescription className="mt-2 text-xs text-[var(--fumaca)] leading-relaxed">
          {plan.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 p-0 pb-6 border-t border-[var(--linha)] pt-4">
        <ul className="space-y-2.5 text-xs text-[var(--marfim-2)]">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-center gap-2">
              <CheckIcon className="text-[var(--patina)] size-3.5 shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="p-0">
        <form
          action={handleCheckout}
          className="w-full"
        >
          <Button
            type="submit"
            className={cn(
              "w-full cursor-pointer",
              plan.isPopular
                ? "btn-ouro !w-full !py-2.5 !text-xs"
                : "btn-linha !w-full !py-2.5 !text-xs",
            )}
          >
            {plan.buttonText}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}

export interface BillingPageProps {
  user?: UserBillingData | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function BillingPage(props?: any) {
  const initialUser = (props as BillingPageProps | undefined)?.user;
  const [user, setUser] = useState<UserBillingData | null>(initialUser ?? null);
  const [activeTab, setActiveTab] = useState<PricingTab>("monthly");

  useEffect(() => {
    if (initialUser !== undefined) {
      setUser(initialUser);
      return;
    }
    void getUserBillingData()
      .then((data) => {
        if (data) setUser(data);
      })
      .catch((err: unknown) => {
        console.error("Erro ao carregar dados de faturamento do usuário:", err);
      });
  }, [initialUser]);

  const totalCredits = user?.credits ?? 0;
  const subscriptionCredits = user?.subscriptionCredits ?? 0;
  const oneTimeCredits = user?.oneTimeCredits ?? 0;
  const activeSubscription =
    user?.subscription &&
    (user.subscription.status === "active" ||
      user.subscription.status === "past_due")
      ? user.subscription
      : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col space-y-8 px-4 py-8">
      {/* Top Header */}
      <div className="relative flex items-center justify-center">
        <Button
          className="absolute top-0 left-0 btn-linha !size-9 !p-0 !rounded-full"
          asChild
          aria-label="Voltar para o painel"
        >
          <Link href="/dashboard">
            <ArrowLeftIcon className="size-4 text-[var(--marfim)]" />
          </Link>
        </Button>
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)] sm:text-4xl">
            Faturamento & Créditos
          </h1>
          <p className="text-xs sm:text-sm text-[var(--fumaca)] max-w-xl mx-auto">
            Economize até 38% com planos mensais recorrentes ou adquira recargas
            avulsas que nunca expiram.
          </p>
        </div>
      </div>

      {/* Transparent Balance Header */}
      <div className="rounded-2xl border border-[var(--linha)] bg-[var(--superficie)]/60 p-6 backdrop-blur-xs shadow-sm">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 sm:divide-x sm:divide-[var(--linha)]">
          <div className="flex flex-col items-center text-center sm:items-start sm:text-left sm:pr-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ouro)] uppercase tracking-wider font-mono">
              <Coins className="size-3.5" />
              <span>Saldo Total Disponível</span>
            </div>
            <div className="mt-2 text-3xl font-bold text-[var(--marfim)]">
              {totalCredits}
            </div>
            <p className="mt-1 text-xs text-[var(--fumaca)]">
              Minutos disponíveis para corte
            </p>
          </div>

          <div className="flex flex-col items-center text-center sm:items-start sm:text-left sm:px-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--patina)] uppercase tracking-wider font-mono">
              <Layers className="size-3.5" />
              <span>Cota do Mês (Assinatura)</span>
            </div>
            <div className="mt-2 text-3xl font-bold text-[var(--marfim)]">
              {subscriptionCredits}
            </div>
            <p className="mt-1 text-xs text-[var(--fumaca)]">
              Consumo prioritário nos cortes
            </p>
          </div>

          <div className="flex flex-col items-center text-center sm:items-start sm:text-left sm:pl-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--cobre)] uppercase tracking-wider font-mono">
              <Zap className="size-3.5" />
              <span>Créditos Avulsos</span>
            </div>
            <div className="mt-2 text-3xl font-bold text-[var(--marfim)]">
              {oneTimeCredits}
            </div>
            <p className="mt-1 text-xs text-[var(--fumaca)]">
              Permanentes • Nunca expiram
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--linha)] pt-3 text-center sm:text-left">
          <p className="text-[11px] text-[var(--fumaca)]">
            💡 <strong className="text-[var(--marfim-2)]">Consumo Inteligente:</strong> seus créditos de assinatura mensal têm prioridade no processamento de vídeos, preservando suas recargas avulsas permanentes.
          </p>
        </div>
      </div>

      {/* Active Subscription Card (Condicional) */}
      {activeSubscription && (
        <ActiveSubscriptionCard subscription={activeSubscription} />
      )}

      {/* Pricing Toggle Tabs */}
      <div className="flex justify-center pt-2">
        <PricingToggleTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </div>

      {/* Pricing Cards Grid */}
      <div
        className={cn(
          "grid grid-cols-1 gap-8",
          activeTab === "monthly" ? "md:grid-cols-2 max-w-3xl mx-auto w-full" : "md:grid-cols-3",
        )}
      >
        {(activeTab === "monthly" ? monthlyPlans : oneTimePacks).map((plan) => (
          <PricingCard key={plan.title} plan={plan} />
        ))}
      </div>

      {/* How Credits Work Explainer */}
      <div className="rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-[var(--marfim)]">
          Como funcionam os créditos
        </h3>
        <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--marfim-2)] leading-relaxed">
          <li>
            <strong>1 crédito = 1 minuto</strong> de vídeo processado pela inteligência artificial.
          </li>
          <li>
            O algoritmo gera em média <strong>1 clipe viral a cada 5 minutos</strong> de gravação.
          </li>
          <li>
            <strong>Consumo Prioritário:</strong> ao cortar um vídeo, debitamos primeiro a sua cota mensal renovada, mantendo seus créditos avulsos protegidos.
          </li>
          <li>
            Créditos avulsos adquiridos <strong>nunca expiram</strong> e ficam disponíveis para sempre.
          </li>
          <li>
            Assinantes contam com fila prioritária de GPU Ultra e gerenciamento autônomo pelo Stripe Portal a qualquer instante.
          </li>
        </ul>
      </div>
    </div>
  );
}
