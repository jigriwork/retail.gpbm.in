"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpenCheck, CheckSquare, ClipboardList, Home, MessageCircle, Store, UploadCloud, UserPlus, Wallet } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const navItems = [
  { label: "Today", href: "/app/today", icon: Home },
  { label: "Stores", href: "/app/stores", icon: Store },
  { label: "Reports", href: "/app/reports", icon: BarChart3 },
  { label: "Tasks", href: "/app/tasks", icon: CheckSquare },
  { label: "Accounts", href: "/app/accounts", icon: BookOpenCheck },
  { label: "Tia", href: "/app/secretary", icon: MessageCircle, ownerOnly: true },
];

const accountantItems = navItems.filter((item) => item.href === "/app/accounts");

const cashierItems = [
  { label: "Cash book", href: "/app/money", icon: Wallet },
  { label: "Uploads", href: "/app/cashier/uploads", icon: UploadCloud },
  { label: "Counts", href: "/app/stock-counts", icon: ClipboardList },
  { label: "Staff", href: "/app/employees", icon: UserPlus },
];

export function BottomNav({ role }: { role?: string }) {
  const pathname = usePathname();
  const visibleItems: Array<{ label: string; href: string; icon: typeof Home; exact?: boolean }> =
    role === "accountant" ? accountantItems : role === "cashier" ? cashierItems : role === "owner" ? navItems : navItems.filter((item) => !item.ownerOnly);
  const columns = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-4", "grid-cols-5", "grid-cols-6"][visibleItems.length];

  return (
    <nav id="app-bottom-nav" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur">
      <div className={cn("mx-auto grid max-w-3xl gap-1", columns, visibleItems.length === 1 && "max-w-xs")}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));

          return (
            <Link
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[0.7rem] font-semibold text-muted transition",
                isActive && "bg-primary text-white",
              )}
              href={item.href}
              key={item.href}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
