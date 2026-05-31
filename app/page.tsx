import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  ClipboardCheck,
  LineChart,
  LockKeyhole,
  Sparkles,
  Store,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const focusAreas = [
  { label: "Sales reports", value: "4 stores", icon: LineChart },
  { label: "Manager updates", value: "Daily", icon: ClipboardCheck },
  { label: "Attendance", value: "Salary ready", icon: CalendarCheck },
  { label: "AI secretary", value: "Coming soon", icon: Sparkles },
];

const stores = ["Go Planet", "Brand Mark", "MITTY", "Future stores"];

export default function Home() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <section className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
              <Store className="size-5" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-muted uppercase">
                GPBM
              </p>
              <p className="text-base font-semibold">Retail Command</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-muted shadow-sm sm:flex">
            <BellRing className="size-4 text-foreground" />
            PWA ready
          </div>
        </header>

        <div className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="space-y-8">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-sm font-medium text-muted shadow-sm">
                <span className="size-2 rounded-full bg-success" />
                Owner and manager workspace
              </div>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl">
                  GPBM Retail
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-muted sm:text-xl">
                  A calm daily control room for sales, stock, salary attendance,
                  store reviews, tasks, reminders, and the next best action.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {focusAreas.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm"
                    key={item.label}
                  >
                    <Icon className="mb-5 size-5 text-muted" />
                    <p className="text-sm text-muted">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="rounded-[1.35rem] border border-border bg-[#FAFAF7] p-5 sm:p-6">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-muted">Secure login</p>
                  <h2 className="mt-2 text-3xl font-semibold tracking-normal">
                    Start your day clear.
                  </h2>
                </div>
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background">
                  <LockKeyhole className="size-5" />
                </div>
              </div>

              <form className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-muted">
                    Email
                  </span>
                  <input
                    className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition focus:border-foreground"
                    placeholder="owner@gpbm.in"
                    type="email"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-muted">
                    Password
                  </span>
                  <input
                    className="h-[3.25rem] w-full rounded-2xl border border-border bg-card px-4 text-base outline-none transition focus:border-foreground"
                    placeholder="Enter password"
                    type="password"
                  />
                </label>
                <Button className="w-full" size="lg" type="button">
                  Continue
                  <ArrowRight className="size-4" />
                </Button>
              </form>

              <div className="mt-8 space-y-3">
                <p className="text-sm font-medium text-muted">Stores in view</p>
                <div className="grid grid-cols-2 gap-2">
                  {stores.map((store) => (
                    <div
                      className="rounded-2xl border border-border bg-card px-3 py-3 text-sm font-medium"
                      key={store}
                    >
                      {store}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
