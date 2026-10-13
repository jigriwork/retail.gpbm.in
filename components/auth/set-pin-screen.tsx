import Image from "next/image";

import { SetPinForm } from "@/components/auth/set-pin";
import { signOut } from "@/lib/auth/actions";

export function SetPinScreen({ name }: { name: string | null }) {
  return (
    <main className="min-h-dvh bg-background px-5 py-8 text-foreground">
      <section className="mx-auto max-w-md rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Image alt="GPBM Retail" className="rounded-xl" height={40} src="/icon-192.png" width={40} />
        <p className="mt-6 text-sm font-medium text-muted">Welcome{name ? `, ${name.split(" ")[0]}` : ""}</p>
        <h1 className="mt-2 text-3xl font-semibold">Choose your PIN</h1>
        <p className="mb-6 mt-3 text-sm leading-6 text-muted">Next time you log in with your mobile number and this PIN. Keep it private: it also opens your salary details.</p>
        <SetPinForm />
        <form action={signOut} className="mt-4"><button className="h-11 w-full rounded-2xl border border-border text-sm font-semibold">Log out</button></form>
      </section>
    </main>
  );
}
