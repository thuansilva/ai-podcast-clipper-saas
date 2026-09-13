"use client";

import type { VariantProps } from "class-variance-authority";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import Link from "next/link";
import { createCheckoutSession, type PriceId } from "~/actions/stripe";
import { Button, type buttonVariants } from "~/components/ui/button";
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
  description: string;
  features: string[];
  buttonText: string;
  buttonVariant: VariantProps<typeof buttonVariants>["variant"];
  isPopular?: boolean;
  savePercentage?: string;
  priceId: PriceId;
}

const plans: PricingPlan[] = [
  {
    title: "Small Pack",
    price: "$9.99",
    description: "Perfect for occasional podcast creators",
    features: ["50 credits", "No expiration", "Download all clips"],
    buttonText: "Buy 50 credits",
    buttonVariant: "outline",
    priceId: "small",
  },
  {
    title: "Medium Pack",
    price: "$24.99",
    description: "Best value for regular podcasters",
    features: ["150 credits", "No expiration", "Download all clips"],
    buttonText: "Buy 150 credits",
    buttonVariant: "default",
    isPopular: true,
    savePercentage: "Save 17%",
    priceId: "medium",
  },
  {
    title: "Large Pack",
    price: "$69.99",
    description: "Ideal for podcast studioes and agencies",
    features: ["500 credits", "No expiration", "Download all clips"],
    buttonText: "Buy 500 credits",
    buttonVariant: "outline",
    isPopular: false,
    savePercentage: "Save 30%",
    priceId: "large",
  },
];

function PricingCard({ plan }: { plan: PricingPlan }) {
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
          Most Popular
        </div>
      )}
      <CardHeader className="flex-1 p-0 pb-6">
        <CardTitle className="text-lg font-semibold text-[var(--marfim)]">{plan.title}</CardTitle>
        <div className="mt-2 text-4xl font-bold text-[var(--marfim)]">{plan.price} </div>
        {plan.savePercentage && (
          <p className="mt-1 font-mono text-xs font-semibold text-[var(--patina)]">
            {plan.savePercentage}
          </p>
        )}
        <CardDescription className="mt-2 text-xs text-[var(--fumaca)] leading-relaxed">{plan.description}</CardDescription>
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
          action={() => createCheckoutSession(plan.priceId)}
          className="w-full"
        >
          <Button
            className={cn(
              "w-full cursor-pointer",
              plan.isPopular
                ? "btn-ouro !w-full !py-2.5 !text-xs"
                : "btn-linha !w-full !py-2.5 !text-xs",
            )}
            type="submit"
          >
            {plan.buttonText}
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}

export default function BillingPage() {
  return (
    <div className="mx-auto flex flex-col space-y-8 px-4 py-12">
      <div className="relative flex items-center justify-center gap-4">
        <Button
          className="absolute top-0 left-0 btn-linha !size-9 !p-0 !rounded-full"
          asChild
        >
          <Link href="/dashboard">
            <ArrowLeftIcon className="size-4 text-[var(--marfim)]" />
          </Link>
        </Button>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--marfim)] sm:text-4xl">
            Buy Credits
          </h1>
          <p className="text-sm text-[var(--fumaca)]">
            Purchase credits to generate more podcast clips. The more credits
            you buy, the better the value.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {plans.map((plan) => (
          <PricingCard key={plan.title} plan={plan} />
        ))}
      </div>

      <div className="rounded-2xl border border-[var(--linha)] bg-[var(--superficie)] p-6 shadow-[0_0_20px_rgba(0,0,0,0.4)]">
        <h3 className="mb-4 text-base font-semibold text-[var(--marfim)]">How credits work</h3>
        <ul className="list-disc space-y-2 pl-5 text-xs text-[var(--marfim-2)]">
          <li>1 credit = 1 minute of podcast processing</li>
          <li>
            The program will create around 1 clip per 5 minutes of podcast
          </li>
          <li>Credits never expire and can be used anytime</li>
          <li>Longer podcasts require more credits based on duration</li>
          <li>All packages are one-time purchases (not subscription)</li>
        </ul>
      </div>
    </div>
  );
}
