import {
  CreditCard,
  LayoutDashboard,
  PlusCircle,
  Scissors,
  Video,
  type LucideIcon,
} from "lucide-react";

export type NavBadge = "new" | "soon";

export interface NavSubItem {
  id: string;
  title: string;
  url: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

interface NavItemBase {
  id: string;
  title: string;
  icon?: LucideIcon;
  badge?: NavBadge;
  disabled?: boolean;
  newTab?: boolean;
}

export interface NavMainLinkItem extends NavItemBase {
  url: string;
  subItems?: never;
}

export interface NavMainParentItem extends NavItemBase {
  subItems: NavSubItem[];
}

export type NavMainItem = NavMainLinkItem | NavMainParentItem;

export interface NavGroup {
  id: number;
  label?: string;
  items: NavMainItem[];
}

export const sidebarItems: NavGroup[] = [
  {
    id: 1,
    label: "Geral",
    items: [
      {
        id: "overview",
        title: "Início",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        id: "create",
        title: "Novo Projeto",
        url: "/dashboard/create",
        icon: PlusCircle,
      },
    ],
  },
  {
    id: 2,
    label: "Meus Projetos",
    items: [
      {
        id: "videos",
        title: "Meus Vídeos",
        url: "/dashboard/videos",
        icon: Video,
      },
      {
        id: "clips",
        title: "Meus Cortes",
        url: "/dashboard/clips",
        icon: Scissors,
      },
    ],
  },
  {
    id: 3,
    label: "Configurações",
    items: [
      {
        id: "billing",
        title: "Assinatura",
        url: "/dashboard/billing",
        icon: CreditCard,
      },
    ],
  },
];
