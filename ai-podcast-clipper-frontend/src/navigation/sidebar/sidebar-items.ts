import {
  CreditCard,
  LayoutDashboard,
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
    ],
  },
  {
    id: 2,
    label: "Meus Projetos",
    items: [
      {
        id: "projects",
        title: "Meus Projetos",
        url: "/dashboard/projects",
        icon: Video,
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
