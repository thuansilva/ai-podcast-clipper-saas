"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser, useClerk } from "@clerk/nextjs";
import { CreditCard, LogOut } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "~/components/ui/dropdown-menu";

function getInitials(name?: string | null, email?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      const first = parts[0]?.[0] ?? "";
      const last = parts[parts.length - 1]?.[0] ?? "";
      return `${first}${last}`.toUpperCase();
    }
    return parts[0]?.slice(0, 2).toUpperCase() ?? "US";
  }
  if (email?.trim()) {
    return email.trim().slice(0, 2).toUpperCase();
  }
  return "US";
}

export function UserNavMenu() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  if (!isLoaded) {
    return (
      <div className="h-8 w-8 animate-pulse rounded-full border border-[var(--linha-2)] bg-[var(--superficie-2)]" />
    );
  }

  if (!user) {
    return null;
  }

  const displayName = user.fullName?.trim() ?? "Usuário Studio";
  const email = user.primaryEmailAddress?.emailAddress;
  const initials = getInitials(user.fullName, email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu do usuário"
          className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[var(--linha-2)] bg-[var(--superficie)] transition-all hover:border-[var(--ouro)]/50 focus:ring-1 focus:ring-[var(--ouro)] focus:outline-none"
        >
          <Avatar className="h-8 w-8">
            {user.imageUrl && (
              <AvatarImage src={user.imageUrl} alt={displayName} />
            )}
            <AvatarFallback className="border border-[var(--ouro)]/20 bg-[var(--superficie-2)] text-xs font-semibold text-[var(--ouro)]">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-56 border-[var(--linha)] bg-[var(--superficie)] p-1.5 text-[var(--marfim)] shadow-xl"
      >
        <DropdownMenuLabel className="px-2.5 py-2 font-normal">
          <div className="flex flex-col space-y-1">
            <p className="truncate text-sm leading-none font-medium text-[var(--marfim)]">
              {displayName}
            </p>
            {email && (
              <p className="truncate text-xs leading-none text-[var(--fumaca)]">
                {email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="my-1 bg-[var(--linha)]" />

        <DropdownMenuItem
          asChild
          className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-[var(--marfim)] transition-colors hover:bg-[var(--superficie-2)] hover:text-[var(--ouro)] focus:bg-[var(--superficie-2)] focus:text-[var(--ouro)]"
        >
          <Link
            href="/dashboard/billing"
            className="flex w-full items-center gap-2"
          >
            <CreditCard className="h-4 w-4 text-[var(--ouro)]" />
            <span>Faturamento & Créditos</span>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1 bg-[var(--linha)]" />

        <DropdownMenuItem
          onClick={() => signOut(() => router.push("/"))}
          className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-red-400 transition-colors hover:bg-red-950/20 hover:text-red-300 focus:bg-red-950/20 focus:text-red-300"
        >
          <LogOut className="h-4 w-4 text-red-400" />
          <span>Sair da conta</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default UserNavMenu;
