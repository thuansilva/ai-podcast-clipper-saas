"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { CreditCard } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const NavHeader = ({ credits }: { credits: number; email: string }) => {
  return (
    <header className="bg-background sticky top-0 z-10 flex justify-center border-b">
      <div className="container flex h-16 items-center justify-between px-4 py-2">
        <Link href="/dashboard" className="flex items-center">
          <div className="font-sans text-xl font-medium tracking-tight">
            <span className="text-foreground">podcast</span>
            <span className="font-light text-gray-500">/</span>
            <span className="text-foreground font-light">clipper</span>
          </div>
        </Link>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="h-8 px-3 py-1.5 text-xs font-medium"
            >
              {credits} credits
            </Badge>
            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-8 text-xs font-medium"
            >
              <Link href="/dashboard/billing">Buy more</Link>
            </Button>
          </div>

          <UserButton>
            <UserButton.MenuItems>
              <UserButton.Link
                label="Billing"
                labelIcon={<CreditCard className="size-4" />}
                href="/dashboard/billing"
              />
            </UserButton.MenuItems>
          </UserButton>
        </div>
      </div>
    </header>
  );
};

export default NavHeader;
