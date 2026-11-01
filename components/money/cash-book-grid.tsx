"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, PencilLine } from "lucide-react";

import { closeCashDayFromGrid, saveCashDay, type GridField } from "@/lib/cash-book/actions";
import { GridDayLines } from "@/components/money/cash-grid-lines";
import { dayLabel, fmt, missingLabel, signed, statusText } from "@/lib/cash-book/format";
import { columnHelp } from "@/lib/cash-book/labels";
import type { CashMonth, CashRow } from "@/lib/cash-book/queries";

type RowSave = { state: "saving" | "saved" | "error"; message?: string };

/** The figure the server holds for a typed column, as the input shows it. */
function serverValue(row: CashRow, field: GridField) {
  if (field === "deposit") return row.deposit_lines ? String(Number(row.deposit)) : "";
  const value = row[field];
  return value === null || value === undefined ? "" : String(Number(value));
}

function editableField(row: CashRow, field: GridField) {
  if (!row.can_edit) return false;
  if (field === "deposit") return row.deposit_lines <= 1;
  if ((field === "card" || field === "upi") && (row.edc_legacy > 0 || row.legacy_combined > 0)) return false;
  return true;
}

export function SoftwareCell({ hide, row }: { hide: boolean; row: CashRow }) {
  const sw = row.software;
  if (!row.exists && row.status !== "missing") return <span className="text-muted">—</span>;
  const pending = sw.status === "pending" || (sw.status === "report" && sw.report_status !== "ready");
  if (hide) {
    if (pending) return <span className="text-muted">{sw.report_status === "processing" ? "Processing" : "Pending"}</span>;
    return sw.matches === null ? <span className="text-muted">Uploaded</span> : sw.matches ? <span className="text-success">Matches</span> : <span className="text-danger">Differs</span>;
  }
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {sw.overridden || sw.status === "override" ? (
        <span title={`Corrected for the cash book. Report: ${sw.override?.original === null || sw.override?.original === undefined ? "pending" : fmt(sw.override.original)}. ${sw.override?.reason ?? ""}`}>
          <PencilLine aria-label="Corrected" className="size-3 text-accent-ink" />
        </span>
      ) : null}
      {sw.report_differs ? (
        <span title={`${sw.status === "workbook" ? "Workbook figure" : "Corrected figure"}; the uploaded report shows ${fmt(sw.report_amount)}`}>
          <AlertTriangle aria-label="Uploaded report differs" className="size-3 text-accent-ink" />
        </span>
      ) : null}
      {sw.changed_after_close ? (
        <span title={`Report changed after closing: now ${sw.report_status === "ready" ? fmt(sw.report_amount) : sw.report_status}`}>
          <AlertTriangle aria-label="Report changed after closing" className="size-3 text-danger" />
        </span>
      ) : null}
      {pending && sw.amount === null ? <span className="text-muted">{sw.report_status === "processing" ? "Processing" : "Pending"}</span> : fmt(sw.amount)}
    </span>
  );
}

/**
 * The month as a spreadsheet. Typed columns save when you leave the cell;
 * Enter / Shift+Enter (or arrow keys) move down / up the column, Tab moves
 * across, Esc undoes the cell. Saves for a day run one at a time with the
 * day's revision, so a second person's change is never overwritten silently.
 */
export function CashBookGrid({ hideSoftware, isCashier = false, isOwner = false, month: initialMonth, otherStores = [], selectedDate, staff = [], storeId }: {
  hideSoftware: boolean; isCashier?: boolean; isOwner?: boolean; month: CashMonth; otherStores?: Array<{ id: string; name: string }>;
  selectedDate: string | null; staff?: Array<{ id: string; name: string }>; storeId: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [drafts, setDrafts] = useState<Record<string, Partial<Record<GridField, string>>>>({});
  const [rowSave, setRowSave] = useState<Record<string, RowSave>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focusAdd, setFocusAdd] = useState<string | null>(null);
  // Values already sent for a cell, so Enter and the blur that follows save once.
  const sent = useRef<Record<string, string>>({});
  const openLines = (date: string) => { setExpanded((current) => ({ ...current, [date]: true })); setFocusAdd(date); };
  const monthRef = useRef(month);
  const pending = useRef<Record<string, Partial<Record<GridField, string>>>>({});
  const saving = useRef<Record<string, boolean>>({});
  const table = useRef<HTMLTableElement>(null);

  // A server refresh (another tab, a line added below) replaces the month.
  const [source, setSource] = useState(initialMonth);
  if (source !== initialMonth) {
    setSource(initialMonth);
    setMonth(initialMonth);
  }
  useEffect(() => { monthRef.current = month; }, [month]);

  const dirtyCount = Object.values(drafts).reduce((count, row) => count + Object.keys(row).length, 0);
  const savingCount = Object.values(rowSave).filter((item) => item.state === "saving").length;
  const errorCount = Object.values(rowSave).filter((item) => item.state === "error").length;

  useEffect(() => {
    if (!dirtyCount && !savingCount) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirtyCount, savingCount]);

  // One save at a time per day; changes made meanwhile are sent next, with the new revision.
  const flush = useCallback(async (date: string) => {
    if (saving.current[date]) return;
    saving.current[date] = true;
    while (pending.current[date] && Object.keys(pending.current[date]).length) {
      const values = pending.current[date];
      delete pending.current[date];
      setRowSave((current) => ({ ...current, [date]: { state: "saving" } }));
      const row = monthRef.current.days.find((item) => item.date === date);
      let result;
      try {
        result = await saveCashDay({ date, month: monthRef.current.month, revision: row?.exists ? row.revision : null, storeId, values });
      } catch {
        result = { ok: false, message: "Not saved: no connection. Your figure is kept; press Retry." };
      }
      for (const field of Object.keys(values)) delete sent.current[`${date}:${field}`];
      if (result.month) { monthRef.current = result.month; setMonth(result.month); }
      if (result.ok) {
        setDrafts((current) => {
          const next = { ...current, [date]: { ...current[date] } };
          for (const [field, value] of Object.entries(values)) if (next[date][field as GridField] === value) delete next[date][field as GridField];
          if (!Object.keys(next[date]).length) delete next[date];
          return next;
        });
        setRowSave((current) => ({ ...current, [date]: { state: "saved" } }));
      } else {
        setRowSave((current) => ({ ...current, [date]: { state: "error", message: result.message } }));
      }
    }
    saving.current[date] = false;
  }, [storeId]);

  const commit = (row: CashRow, field: GridField) => {
    const draft = drafts[row.date]?.[field];
    if (draft === undefined) return;
    if (draft.trim() === serverValue(row, field)) {
      setDrafts((current) => {
        const next = { ...current, [row.date]: { ...current[row.date] } };
        delete next[row.date][field];
        if (!Object.keys(next[row.date]).length) delete next[row.date];
        return next;
      });
      return;
    }
    const cellKey = `${row.date}:${field}`;
    if (sent.current[cellKey] === draft.trim()) return;
    sent.current[cellKey] = draft.trim();
    pending.current[row.date] = { ...pending.current[row.date], [field]: draft.trim() };
    void flush(row.date);
  };

  const retry = (date: string) => {
    const values = drafts[date];
    if (!values) return;
    for (const field of Object.keys(values)) delete sent.current[`${date}:${field}`];
    pending.current[date] = { ...values };
    void flush(date);
  };

  const move = (from: HTMLInputElement, step: number) => {
    const inputs = Array.from(table.current?.querySelectorAll<HTMLInputElement>(`input[data-field="${from.dataset.field}"]:not([disabled])`) ?? []);
    const index = inputs.indexOf(from);
    const target = inputs[index + step];
    if (target) { target.focus(); target.select(); }
  };

  const close = async (row: CashRow) => {
    setRowSave((current) => ({ ...current, [row.date]: { state: "saving" } }));
    let result;
    try {
      result = await closeCashDayFromGrid({ date: row.date, month: monthRef.current.month, revision: row.revision, storeId });
    } catch {
      result = { ok: false, message: "Not closed: no connection." };
    }
    if (result.month) { monthRef.current = result.month; setMonth(result.month); }
    setRowSave((current) => ({ ...current, [row.date]: result.ok ? { state: "saved", message: result.message } : { state: "error", message: result.message } }));
  };

  const totals = month.totals;
  const colCount = 15;

  return (
    <div className="space-y-2">
      <div aria-live="polite" className="flex flex-wrap items-center gap-3 text-xs font-semibold" role="status">
        {savingCount ? <span className="inline-flex items-center gap-1 text-muted"><Loader2 className="size-3 animate-spin" />Saving…</span>
          : errorCount ? <span className="inline-flex items-center gap-1 text-danger"><AlertTriangle className="size-3" />{errorCount} day{errorCount === 1 ? "" : "s"} not saved, see Status</span>
            : dirtyCount ? <span className="text-accent-ink">{dirtyCount} change{dirtyCount === 1 ? "" : "s"} not saved yet</span>
              : <span className="inline-flex items-center gap-1 text-success"><Check className="size-3" />All changes saved</span>}
        <span className="font-normal text-muted">Type in the white cells · Tab → next column · Enter ↓ next day · Shift+Enter ↑ · Esc undoes · 0 means none, empty means not entered · click Cash exp. or Other to add expenses and other cash</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[1080px] border-collapse text-xs tabular-nums" ref={table}>
          <thead className="bg-background text-[0.7rem] uppercase tracking-wide text-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-background px-2 py-2 text-left">Date</th>
              <th className="px-2 py-2 text-right">Opening</th>
              <th className="px-2 py-2 text-right" title={columnHelp.book_sales}>Book Sales</th>
              <th className="px-2 py-2 text-right" title="From the uploaded sales report (item lines, returns netted)">Software</th>
              <th className="px-2 py-2 text-right" title="Software Sales − Book Sales">Sales diff.</th>
              <th className="px-2 py-2 text-right" title={columnHelp.card}>EDC / Card</th>
              <th className="px-2 py-2 text-right" title={columnHelp.upi}>UPI</th>
              <th className="px-2 py-2 text-right" title={columnHelp.deposit}>Bank dep.</th>
              <th className="px-2 py-2 text-right" title="Shop expenses, staff payments and donations paid in cash">Cash exp.</th>
              <th className="px-2 py-2 text-right" title="Cash received − owner/home − sent to other store − other payouts (open the day for details)">Other in/out</th>
              <th className="px-2 py-2 text-right" title="Opening + Book Sales − Card − UPI − deposits − cash expenses ± other">Calc. closing</th>
              <th className="px-2 py-2 text-right" title={columnHelp.counted}>Counted</th>
              <th className="px-2 py-2 text-right" title="Counted − Calculated closing">Cash diff.</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-1 py-2"><span className="sr-only">Lines</span></th>
            </tr>
          </thead>
          <tbody>
            {month.days.map((row) => {
              const save = rowSave[row.date];
              const selected = row.date === selectedDate;
              const inactive = ["future", "before_start", "not_started", "no_access"].includes(row.status);
              const cell = (field: GridField) => {
                const canType = editableField(row, field);
                const draft = drafts[row.date]?.[field];
                const value = draft ?? serverValue(row, field);
                if (!canType) {
                  const shown = field === "deposit" ? (row.deposit ? fmt(row.deposit) : row.exists ? "0" : "—")
                    : field === "card" && row.edc_legacy ? <span title="Old combined EDC line (card + UPI)">{fmt(row.edc_legacy)}*</span>
                      : field === "card" && row.legacy_combined ? <span className="text-muted" title="Imported: payments were combined with expenses in the workbook">in legacy</span>
                        : fmt(row[field as Exclude<GridField, "deposit">]);
                  return <td className="px-2 py-1 text-right">{shown}</td>;
                }
                const missing = row.exists && row.missing.includes(field) && draft === undefined;
                return (
                  <td className="px-1 py-1 text-right">
                    <input
                      aria-label={`${field === "deposit" ? "Bank deposit" : missingLabel[field]} ${row.date}`}
                      className={`h-8 w-[5.5rem] rounded-lg border bg-background px-2 text-right outline-none focus:border-primary focus:bg-card ${draft !== undefined ? "border-accent" : missing ? "border-danger/50" : "border-border"}`}
                      data-field={field}
                      inputMode="decimal"
                      onBlur={() => commit(row, field)}
                      onChange={(event) => setDrafts((current) => ({ ...current, [row.date]: { ...current[row.date], [field]: event.target.value } }))}
                      onFocus={(event) => event.target.select()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp") {
                          event.preventDefault();
                          commit(row, field);
                          move(event.currentTarget, event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1);
                        } else if (event.key === "Escape") {
                          setDrafts((current) => {
                            const next = { ...current, [row.date]: { ...current[row.date] } };
                            delete next[row.date][field];
                            return next;
                          });
                        }
                      }}
                      placeholder={missing ? "?" : ""}
                      value={value}
                    />
                  </td>
                );
              };
              const difference = row.cash_difference === null ? null : Number(row.cash_difference);
              return (
                <Fragment key={row.date}>
                  <tr className={`border-t border-border ${selected ? "bg-primary-soft/40" : ""} ${inactive ? "text-muted" : ""}`}>
                    <td className={`sticky left-0 z-10 px-2 py-1 font-semibold ${selected ? "bg-primary-soft" : "bg-card"}`}>
                      <Link className="underline-offset-2 hover:underline" href={`?store=${storeId}&month=${month.month.slice(0, 7)}&date=${row.date}#day`} scroll={false}>{dayLabel(row.date)}</Link>
                    </td>
                    <td className="px-2 py-1 text-right">{fmt(row.opening)}</td>
                    {cell("book_sales")}
                    <td className="px-2 py-1 text-right"><SoftwareCell hide={hideSoftware} row={row} /></td>
                    <td className={`px-2 py-1 text-right ${row.sales_difference && Math.abs(Number(row.sales_difference)) > 1 ? "font-semibold text-danger" : ""}`}>{signed(row.sales_difference)}</td>
                    {cell("card")}
                    {cell("upi")}
                    {cell("deposit")}
                    {(["cash_expenses", "other_net"] as const).map((key) => (
                      <td className="px-1 py-1 text-right" key={key}>
                        {row.can_edit || row.exists ? (
                          <button
                            className={`h-8 w-[5.5rem] rounded-lg px-2 text-right ${row.can_edit ? "border border-dashed border-border hover:border-primary hover:bg-primary-soft/40" : ""}`}
                            onClick={() => openLines(row.date)}
                            title={row.can_edit ? "Add or remove expenses and other cash for this day" : "Show this day's lines"}
                            type="button"
                          >
                            {row.exists ? (key === "cash_expenses" ? fmt(row.cash_expenses) : signed(row.other_net)) : row.can_edit ? <span className="text-muted">+ add</span> : "—"}
                          </button>
                        ) : "—"}
                      </td>
                    ))}
                    <td className={`px-2 py-1 text-right font-semibold ${row.closing !== null && Number(row.closing) < 0 ? "text-danger" : ""}`}>{fmt(row.closing)}</td>
                    {cell("counted")}
                    <td className={`px-2 py-1 text-right font-semibold ${difference === null ? "" : Math.abs(difference) <= 10 ? "text-success" : difference < 0 ? "text-danger" : "text-accent-ink"}`}>
                      {difference === null ? (row.status === "closed" && row.source === "legacy_import" ? <span className="font-normal text-muted">not counted</span> : "—") : signed(difference)}
                    </td>
                    <td className="px-2 py-1">
                      <div className="flex min-w-[8.5rem] flex-wrap items-center gap-1">
                        <span className={row.status === "missing" ? "text-muted" : row.can_close ? "font-semibold text-primary" : ""}>{statusText(row)}</span>
                        {row.status === "open" && row.missing.length && !row.can_close ? (
                          <span className="text-[0.65rem] text-danger" title="Type 0 when there was none">needs {row.missing.filter((item) => item !== "opening").map((item) => missingLabel[item] ?? item).join(", ")}</span>
                        ) : null}
                        {row.can_close && !drafts[row.date] && save?.state !== "saving" ? (
                          <button className="rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-semibold text-white" onClick={() => void close(row)} type="button">Close day</button>
                        ) : null}
                        {save?.state === "saving" ? <Loader2 aria-label="Saving" className="size-3 animate-spin text-muted" /> : null}
                        {save?.state === "saved" && !drafts[row.date] ? <Check aria-label="Saved" className="size-3 text-success" /> : null}
                        {save?.state === "error" ? (
                          <span className="flex items-center gap-1 text-[0.65rem] text-danger">
                            {save.message}
                            {drafts[row.date] ? <button className="font-semibold underline" onClick={() => retry(row.date)} type="button">Retry</button> : null}
                          </span>
                        ) : null}
                        {save?.state === "saved" && save.message ? <span className="text-[0.65rem] text-success">{save.message}</span> : null}
                        {row.flags.includes("negative_closing") ? <span className="text-[0.65rem] text-danger">negative</span> : null}
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      {row.exists || row.can_edit ? (
                        <button
                          aria-expanded={Boolean(expanded[row.date])}
                          aria-label={`Show the lines of ${row.date}`}
                          className="rounded p-1 text-muted hover:text-foreground"
                          onClick={() => setExpanded((current) => ({ ...current, [row.date]: !current[row.date] }))}
                          type="button"
                        >
                          {expanded[row.date] ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {expanded[row.date] ? (
                    <tr className="bg-background">
                      <td className="px-3 py-2" colSpan={colCount}>
                        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
                          <Breakdown hideSoftware={hideSoftware} row={row} />
                          <GridDayLines
                            canEdit={row.can_edit}
                            date={row.date}
                            focusAdd={focusAdd === row.date}
                            isCashier={isCashier}
                            isOwner={isOwner}
                            key={`${row.date}:${row.can_edit}`}
                            month={month.month}
                            onMonth={(next) => { monthRef.current = next; setMonth(next); }}
                            otherStores={otherStores}
                            staff={staff}
                            storeId={storeId}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border bg-background font-semibold">
            <tr>
              <td className="sticky left-0 z-10 bg-background px-2 py-2">Month</td>
              <td className="px-2 py-2 text-right" title="Balance at the start of the month">{fmt(month.opening)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.book_sales)}</td>
              <td className="px-2 py-2 text-right">{hideSoftware ? "—" : fmt(totals.software_sales)}</td>
              <td className="px-2 py-2 text-right">{hideSoftware ? "—" : signed(totals.sales_difference)}</td>
              <td className="px-2 py-2 text-right">{fmt(Number(totals.card ?? 0) + Number(totals.edc_legacy ?? 0) || null)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.upi)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.deposit)}</td>
              <td className="px-2 py-2 text-right">{fmt(totals.cash_expenses)}</td>
              <td className="px-2 py-2 text-right">{signed(totals.other_net)}</td>
              <td className="px-2 py-2 text-right" title="Balance at the end of the last closed day">{fmt(month.closing)}</td>
              <td className="px-2 py-2 text-right">—</td>
              <td className="px-2 py-2 text-right">{signed(totals.cash_difference)}</td>
              <td className="px-2 py-2" colSpan={2}>{month.complete ? "Complete" : month.closing_date ? `Incomplete · closed to ${dayLabel(month.closing_date)}` : "Incomplete"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Breakdown({ hideSoftware, row }: { hideSoftware: boolean; row: CashRow }) {
  const items: Array<[string, number | null | undefined, string?]> = [
    ["Card (EDC machine)", row.card], ["UPI", row.upi], ["Old combined EDC line", row.edc_legacy || null],
    ["Bank deposit (transfer)", row.deposit || null], ["Shop expenses", row.shop_expenses || null], ["Staff payments", row.staff || null],
    ["Donations", row.donation || null], ["Owner / home", row.owner_home || null], ["Sent to other store", row.to_store || null],
    ["Other payouts / adjustments", row.other_out || null], ["Cash received / adjustments in", row.other_in || null],
    ["Legacy combined deduction", row.legacy_combined || null, "Imported workbook figure: payments and expenses together"],
    ["Paid by UPI/bank (not from drawer)", row.bank_paid_expenses, "Shown for information; never deducted from cash"],
  ];
  return (
    <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
      {items.filter(([, value]) => value !== null && value !== undefined).map(([label, value, hint]) => (
        <div className="flex justify-between gap-2" key={label} title={hint}>
          <span className="text-muted">{label}</span><span className="font-semibold">{fmt(value)}</span>
        </div>
      ))}
      {!hideSoftware && row.software.report_status === "ready" ? (
        <div className="flex justify-between gap-2"><span className="text-muted">Report ({row.software.basis === "summary" ? "summary lines" : row.software.basis === "item" ? "bill lines" : "no sale"})</span><span className="font-semibold">{fmt(row.software.report_amount)}</span></div>
      ) : null}
      {!hideSoftware && row.software.legacy_workbook !== null ? (
        <div className="flex justify-between gap-2"><span className="text-muted">Workbook Software Sales</span><span className="font-semibold">{fmt(row.software.legacy_workbook)}</span></div>
      ) : null}
      {row.closed_by ? <div className="text-muted sm:col-span-2">Closed by {row.closed_by}{row.reviewed_by ? ` · checked by ${row.reviewed_by}` : ""}</div> : null}
      {row.updated_by ? <div className="text-muted sm:col-span-2">Last change by {row.updated_by}</div> : null}
      {row.note ? <div className="text-muted sm:col-span-3">“{row.note}”</div> : null}
    </div>
  );
}
