"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  SparklesIcon, 
  LayoutDashboardIcon, 
  PlusCircleIcon, 
  VideoIcon, 
  ClapperboardIcon, 
  CreditCardIcon, 
  LogOutIcon 
} from "lucide-react";
import { SignOutButton, useUser } from "@clerk/nextjs";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent
} from "~/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useUser();

  const links = [
    { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon },
    { href: "/dashboard/create", label: "Novo Projeto", icon: PlusCircleIcon },
    { href: "/dashboard/videos", label: "Meus Vídeos", icon: VideoIcon },
    { href: "/dashboard/clips", label: "Meus Cortes", icon: ClapperboardIcon },
  ];

  const configLinks = [
    { href: "/dashboard/billing", label: "Assinatura & Créditos", icon: CreditCardIcon },
  ];

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link prefetch={false} href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-[var(--ouro)]/10 text-[var(--ouro)]">
                  <SparklesIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-[var(--marfim)]">Podcast Clipper</span>
                  <span className="truncate text-xs text-[var(--fumaca)]">AI Studio</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {links.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        
        <SidebarGroup>
          <SidebarGroupLabel>Configurações</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {configLinks.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href} tooltip={item.label}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? "User"} />
                <AvatarFallback className="rounded-lg">US</AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-[var(--marfim)]">{user?.fullName ?? "Usuário"}</span>
                <span className="truncate text-xs text-[var(--fumaca)]">{user?.primaryEmailAddress?.emailAddress}</span>
              </div>
              <SignOutButton>
                 <LogOutIcon className="ml-auto size-4 text-[var(--fumaca)] hover:text-red-400 cursor-pointer" />
              </SignOutButton>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
