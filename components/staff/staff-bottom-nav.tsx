"use client";

import { BadgeIndianRupee, FileText, Home, ListChecks, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

const items = [
  { href: "/staff", icon: Home, label: "Home" },
  { href: "/staff/sales", icon: BadgeIndianRupee, label: "Sales" },
  { href: "/staff/tasks", icon: ListChecks, label: "Tasks" },
  { href: "/staff/payslips", icon: FileText, label: "Payslips" },
  { href: "/staff/profile", icon: UserRound, label: "Profile" },
];

export function StaffBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">{items.map((item) => { const Icon = item.icon; const active = item.href === "/staff" ? pathname === item.href : pathname.startsWith(item.href); return <Link className={cn("flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[0.68rem] font-semibold text-muted", active && "bg-foreground text-background")} href={item.href} key={item.href}><Icon className="size-4" /><span>{item.label}</span></Link>; })}</div>
    </nav>
  );
}
