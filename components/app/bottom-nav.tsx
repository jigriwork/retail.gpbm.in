"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CheckSquare, Home, MessageCircle, Store } from "lucide-react";

import { cn } from "@/lib/utils/cn";

const navItems = [
  { label: "Today", href: "/app/today", icon: Home },
  { label: "Stores", href: "/app/stores", icon: Store },
  { label: "Reports", href: "/app/reports", icon: BarChart3 },
  { label: "Tasks", href: "/app/tasks", icon: CheckSquare },
  { label: "Secretary", href: "/app/secretary", icon: MessageCircle, ownerOnly: true },
];

export function BottomNav({ role }: { role?: string }) {
  const pathname = usePathname();
  const visibleItems = role === "owner" ? navItems : navItems.filter((item) => !item.ownerOnly);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur">
      <div className={cn("mx-auto grid max-w-3xl gap-1", visibleItems.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[0.7rem] font-semibold text-muted transition",
                isActive && "bg-foreground text-background",
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
