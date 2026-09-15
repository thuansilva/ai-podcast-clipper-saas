"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { createCustomerPortalSession } from "~/actions/stripe";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export interface ActiveSubscriptionData {
  id?: string;
  plan: string;
  status: string;
  monthlyCredits?: number;
  currentPeriodStart?: Date | string;
  currentPeriodEnd?: Date | string;
  cancelAtPeriodEnd?: boolean;
}

export interface ActiveSubscriptionCardProps {
  subscription: ActiveSubscriptionData;
  className?: string;
  onManageSubscription?: () => void | Promise<void>;
}

export function ActiveSubscriptionCard({
  subscription,
  className,
  onManageSubscription,
}: ActiveSubscriptionCardProps) {
  const [loading, setLoading] = useState(false);

  const planName =
    subscription.plan === "PRO_STUDIO"
      ? "Pro Studio"
      : subscription.plan === "CREATOR"
        ? "Creator"
        : subscription.plan;

  const monthlyCredits =
    subscription.monthlyCredits ??
    (subscription.plan === "PRO_STUDIO" ? 500 : 150);

  const formattedPeriodEnd = subscription.currentPeriodEnd
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(subscription.currentPeriodEnd))
    : null;

  const handleManage = async () => {
    try {
      setLoading(true);
      if (onManageSubscription) {
        await onManageSubscription();
      } else {
        await createCustomerPortalSession();
      }
    } catch {
      setLoading(false);
      toast.error("Erro ao acessar o portal de faturamento. Tente novamente.");
    }
  };

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl border border-[var(--ouro)]/30 bg-gradient-to-br from-[var(--superficie-2)] via-[var(--superficie)] to-[var(--superficie-2)] p-6 shadow-[0_0_30px_rgba(232,186,82,0.08)]",
        className,
      )}
    >
      <div className="absolute top-0 right-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-[var(--ouro)]/5 blur-2xl pointer-events-none" />

      <CardContent className="flex flex-col gap-6 p-0 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[var(--ouro)]/20 bg-[var(--ouro)]/10 text-[var(--ouro)] shadow-inner">
            <ShieldCheck className="size-6" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-[var(--marfim)]">
                {planName}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-[var(--patina)]/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--patina)] uppercase">
                <CheckCircle2 className="size-3" />
                {subscription.status === "active" ? "Assinatura Ativa" : subscription.status}
              </span>
              {subscription.cancelAtPeriodEnd && (
                <span className="rounded-full bg-[var(--perigo)]/15 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[var(--perigo)] uppercase">
                  Cancelamento Agendado
                </span>
              )}
            </div>

            <p className="text-xs text-[var(--fumaca)]">
              Cota mensal inclusa:{" "}
              <strong className="text-[var(--marfim)] font-semibold">
                {monthlyCredits} créditos/mês
              </strong>
              {formattedPeriodEnd && (
                <>
                  {" • "}
                  {subscription.cancelAtPeriodEnd
                    ? `Acesso garantido até ${formattedPeriodEnd}`
                    : `Próxima renovação em ${formattedPeriodEnd}`}
                </>
              )}
            </p>
          </div>
        </div>

        <form
          action={handleManage}
          className="shrink-0"
        >
          <Button
            type="submit"
            disabled={loading}
            className="btn-ouro !py-2.5 !px-5 !text-xs cursor-pointer flex items-center gap-2 shadow-sm"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <span>Gerenciar Assinatura</span>
                <ExternalLink className="size-3.5" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
