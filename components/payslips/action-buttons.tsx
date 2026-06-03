"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileDown, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PayslipActionState } from "@/lib/payslips/actions";

const initialState: PayslipActionState = {
  ok: false,
  message: "",
};

export function GenerateAllPayslipsForm({
  action,
  batchId,
}: {
  action: (previous: PayslipActionState, formData: FormData) => Promise<PayslipActionState>;
  batchId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input name="batchId" type="hidden" value={batchId} />
      <Button disabled={pending} size="md">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        Generate all valid payslips
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function GenerateBatchPayslipsProgress({
  action,
  rows,
}: {
  action: (previous: PayslipActionState, formData: FormData) => Promise<PayslipActionState>;
  rows: { id: string; staffName: string; storeName: string }[];
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [current, setCurrent] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState<string[]>([]);
  const total = rows.length;
  const percent = total ? Math.round((done / total) * 100) : 0;

  async function generateAll() {
    if (!total || running) return;

    setRunning(true);
    setDone(0);
    setFailed([]);
    setMessage("Starting payslip generation...");

    const failures: string[] = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      setCurrent(`${row.staffName} (${row.storeName})`);
      setMessage(`Generating ${index + 1} of ${total}`);

      const formData = new FormData();
      formData.set("rowId", row.id);
      const result = await action({ ok: false, message: "" }, formData);

      if (!result.ok) {
        failures.push(`${row.staffName}: ${result.message}`);
        setFailed([...failures]);
      }

      setDone(index + 1);
    }

    setCurrent("");
    setRunning(false);
    setMessage(
      failures.length
        ? `Generated ${total - failures.length} of ${total}. ${failures.length} failed.`
        : `Generated ${total} payslip${total === 1 ? "" : "s"}.`,
    );
    router.refresh();
  }

  return (
    <div className="min-w-[min(100%,24rem)] space-y-3">
      <Button disabled={running || !total} onClick={generateAll} size="md" type="button">
        {running ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
        Generate all valid payslips
      </Button>

      {running || done > 0 || message ? (
        <div className="rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
            <span>{message}</span>
            <span>{percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            <span>
              {running && current ? `Now: ${current}` : `${done} of ${total} processed`}
            </span>
          </div>
          {failed.length ? (
            <div className="mt-2 space-y-1 text-xs font-medium text-danger">
              {failed.slice(0, 3).map((item) => (
                <p key={item}>{item}</p>
              ))}
              {failed.length > 3 ? <p>{failed.length - 3} more failed.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function GeneratePayslipRowForm({
  action,
  rowId,
}: {
  action: (previous: PayslipActionState, formData: FormData) => Promise<PayslipActionState>;
  rowId: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-2">
      <input name="rowId" type="hidden" value={rowId} />
      <Button className="h-10 rounded-xl px-3 text-xs" disabled={pending} size="md" variant="secondary">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Generate
      </Button>
      {state.message ? (
        <p className={state.ok ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
