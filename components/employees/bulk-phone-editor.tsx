"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { EmployeeBulkPhoneState } from "@/lib/employees/actions";

type BulkPhoneContact = {
  id: string;
  phone: string | null;
  staffName: string;
  storeName: string;
  whatsappPhone: string | null;
};

const initialState: EmployeeBulkPhoneState = {
  ok: false,
  message: "",
};

export function BulkPhoneEditor({
  action,
  contacts,
}: {
  action: (previous: EmployeeBulkPhoneState, formData: FormData) => Promise<EmployeeBulkPhoneState>;
  contacts: BulkPhoneContact[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.ok) {
      router.refresh();
    }
  }, [router, state.ok]);

  if (!contacts.length) {
    return null;
  }

  return (
    <form action={formAction} className="rounded-[1.35rem] border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Bulk edit phone numbers</h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Add missing numbers or change saved numbers for visible staff, then save once. Blank boxes are skipped.
          </p>
        </div>
        <Button className="shrink-0" disabled={pending} type="submit">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save All Numbers
        </Button>
      </div>

      <div className="mt-4 grid gap-2">
        {contacts.map((contact) => (
          <div
            className="grid gap-2 rounded-2xl border border-border bg-background p-3 md:grid-cols-[1fr_0.8fr_13rem]"
            key={contact.id}
          >
            <input name="contactIds" type="hidden" value={contact.id} />
            <div>
              <p className="font-semibold">{contact.staffName}</p>
              <p className="mt-1 text-xs text-muted">{contact.storeName}</p>
            </div>
            <div>
              <p className={contact.whatsappPhone ? "text-xs font-semibold text-success" : "text-xs font-semibold text-warning"}>
                {contact.whatsappPhone ? "Phone Ready" : "Phone Missing"}
              </p>
              <p className="mt-1 text-xs text-muted">{contact.whatsappPhone || "No WhatsApp number"}</p>
            </div>
            <input
              className="h-11 rounded-2xl border border-border bg-card px-3 text-sm outline-none focus:border-foreground"
              defaultValue={contact.phone ?? ""}
              inputMode="tel"
              name={`phone:${contact.id}`}
              placeholder="Phone number"
            />
          </div>
        ))}
      </div>

      {state.message ? (
        <p className={state.ok ? "mt-3 text-sm font-semibold text-success" : "mt-3 text-sm font-semibold text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
