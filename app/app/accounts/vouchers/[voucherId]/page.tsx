import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { OpenDocument } from "@/components/accounts/open-document";
import { getFinanceSession } from "@/lib/accounts/access";
import { indiaToday, labelFor, money, noteReasons, shortDate, voucherTypes } from "@/lib/accounts/format";
import { allocateEntry, linkDocument, releaseAllocation, reverseEntry, saveDispute } from "@/lib/accounts/ledger-actions";
import { getVoucher, linkableDocuments, openBills, openCredits } from "@/lib/accounts/ledger-queries";

const accountLabels: Record<string, string> = {
  bank: "Bank", cash: "Cash", claims_income: "Claims / margin income", discount_received: "Discount received", freight: "Freight",
  input_cgst: "Input CGST", input_igst: "Input IGST", input_sgst: "Input SGST", opening_balance: "Opening balance", other_charges: "Other charges",
  purchase_returns: "Purchase returns", purchases: "Purchases", round_off: "Round off", supplier: "Supplier", supplier_transfer: "Supplier transfer",
};

export default async function VoucherPage({ params, searchParams }: { params: Promise<{ voucherId: string }>; searchParams: Promise<{ posted?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Vouchers are visible to the owner and people with accounts access." />;
  const [{ voucherId }, { posted }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(voucherId)) notFound();
  const { voucher, lines, outgoing, incoming, links, others, open, invoiceId } = await getVoucher(voucherId);
  if (!voucher) notFound();
  const canPost = session.can.post && voucher.status === "posted";
  const counterparts = canPost && voucher.party_id && (open ?? 0) > 0
    ? voucher.supplier_side === "debit" ? await openBills(voucher.firm_id, voucher.party_id) : await openCredits(voucher.firm_id, voucher.party_id)
    : [];
  const documents = canPost ? await linkableDocuments(voucher.store_id) : [];
  const allocations = [
    ...outgoing.map((item) => ({ ...item, other: others.get(item.to_voucher_id) })),
    ...incoming.map((item) => ({ ...item, other: others.get(item.from_voucher_id) })),
  ];

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/daybook" session={session} />
      {posted ? <Notice tone="info">Posted. The supplier ledger now includes this entry.</Notice> : null}
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">{labelFor(voucherTypes, voucher.voucher_type)}{voucher.reason ? ` · ${labelFor(noteReasons, voucher.reason)}` : ""}</p>
        <h1 className="mt-2 text-3xl font-semibold">{voucher.voucher_no}</h1>
        <p className="mt-2 text-sm text-muted">
          {shortDate(voucher.voucher_date)} · Billed under <strong className="text-foreground">{voucher.billing_firms?.name}</strong>
          {voucher.stores?.name ? ` · ${voucher.stores.name}` : ""}
          {voucher.parties?.legal_name ? <> · <Link className="font-semibold text-foreground underline" href={`/app/accounts/parties/${voucher.party_id}/ledger?firm=${voucher.firm_id}`}>{voucher.parties.legal_name}</Link></> : null}
          {voucher.reference_no ? ` · ref ${voucher.reference_no}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={voucher.status === "posted" ? "good" : "muted"}>{voucher.reverses_voucher_id ? "reversal" : voucher.status}</Badge>
          <Badge>{money(voucher.amount)} {voucher.supplier_side === "credit" ? "added to what we owe" : "reduces what we owe"}</Badge>
          {open !== null && voucher.party_id ? <Badge tone={open > 0 ? "warn" : "good"}>{open > 0 ? `${money(open)} not adjusted yet` : "fully adjusted"}</Badge> : null}
          {voucher.due_date ? <Badge>Due {shortDate(voucher.due_date)}</Badge> : null}
          {invoiceId ? <Link className="text-sm font-semibold text-primary" href={`/app/accounts/purchases/${invoiceId}`}>Open purchase →</Link> : null}
          {voucher.reverses_voucher_id ? <Link className="text-sm font-semibold text-primary" href={`/app/accounts/vouchers/${voucher.reverses_voucher_id}`}>Original entry →</Link> : null}
          {voucher.reversed_by_voucher_id && !voucher.reverses_voucher_id ? <Link className="text-sm font-semibold text-primary" href={`/app/accounts/vouchers/${voucher.reversed_by_voucher_id}`}>Reversal →</Link> : null}
        </div>
        {voucher.narration ? <p className="mt-3 text-sm">{voucher.narration}</p> : null}
      </section>

      <Panel description="Every voucher balances: total debit equals total credit." title="Entries">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead className="text-left text-xs text-muted"><tr><th className="py-1">Account</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) => (
              <tr key={line.id}>
                <td className="py-1.5">{accountLabels[line.account] ?? line.account}{line.brands?.name ? ` · ${line.brands.name}` : ""}{line.description ? <span className="block text-xs text-muted">{line.description}</span> : null}</td>
                <td className="text-right">{Number(line.debit) ? money(line.debit) : ""}</td>
                <td className="text-right">{Number(line.credit) ? money(line.credit) : ""}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-1.5">Total</td>
              <td className="text-right">{money(lines.reduce((sum, line) => sum + Math.round(Number(line.debit) * 100), 0) / 100)}</td>
              <td className="text-right">{money(lines.reduce((sum, line) => sum + Math.round(Number(line.credit) * 100), 0) / 100)}</td>
            </tr>
          </tbody>
        </table>
        </div>
      </Panel>

      {voucher.party_id ? (
        <Panel description="Which bills this entry is set against. Undoing an adjustment keeps it in history." title="Adjusted against">
          {allocations.length ? (
            <ul className="space-y-2 text-sm">
              {allocations.map((item) => (
                <li className="rounded-xl border border-border bg-background p-3" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{item.other ? <Link className="font-semibold underline" href={`/app/accounts/vouchers/${item.other.id}`}>{item.other.voucher_no}</Link> : "—"} · {money(item.amount)}</span>
                    <Badge tone={item.released_at ? "muted" : "good"}>{item.released_at ? `undone: ${item.release_reason ?? ""}` : "active"}</Badge>
                  </div>
                  {canPost && !item.released_at ? (
                    <ActionForm action={releaseAllocation} className="mt-2 flex flex-wrap items-center gap-2" submitLabel="Undo adjustment" variant="secondary">
                      <input name="allocationId" type="hidden" value={item.id} />
                      <input name="voucherId" type="hidden" value={voucher.id} />
                      <input className={`${inputClass} h-9 max-w-64`} name="reason" placeholder="Why" required />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <Empty>Not adjusted against anything.</Empty>}
          {counterparts.length ? (
            <ActionForm action={allocateEntry} className="mt-3 flex flex-wrap items-end gap-3" submitLabel="Adjust" variant="secondary">
              <input name={voucher.supplier_side === "debit" ? "fromId" : "toId"} type="hidden" value={voucher.id} />
              <div className="min-w-64 flex-1">
                <Field label={voucher.supplier_side === "debit" ? "Against bill" : "Using unadjusted entry"}>
                  <select className={inputClass} name={voucher.supplier_side === "debit" ? "toId" : "fromId"}>
                    {counterparts.map((item) => <option key={item.id} value={item.id}>{item.reference_no ?? item.voucher_no} · {shortDate(item.voucher_date)} · open {money(item.open)}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Amount"><input className={`${inputClass} w-36`} inputMode="decimal" name="amount" required /></Field>
            </ActionForm>
          ) : null}
        </Panel>
      ) : null}

      <Panel title="Documents">
        {links.length ? (
          <ul className="space-y-2 text-sm">
            {links.map((link) => link.finance_documents ? (
              <li className="flex items-center justify-between gap-2" key={link.id}>{link.finance_documents.title ?? link.finance_documents.file_name}<OpenDocument id={link.finance_documents.id} /></li>
            ) : null)}
          </ul>
        ) : <Empty>No documents attached.</Empty>}
        {canPost && documents.length ? (
          <ActionForm action={linkDocument} className="mt-3 flex flex-wrap items-end gap-3" submitLabel="Attach" variant="secondary">
            <input name="entityType" type="hidden" value="voucher" />
            <input name="entityId" type="hidden" value={voucher.id} />
            <div className="min-w-64 flex-1"><Field label="Document"><select className={inputClass} name="documentId">{documents.map((document) => <option key={document.id} value={document.id}>{document.title ?? document.file_name}</option>)}</select></Field></div>
          </ActionForm>
        ) : null}
      </Panel>

      {canPost && voucher.party_id ? (
        <Panel description="Record a disagreement with the supplier about this entry. It shows as a difference to resolve; it does not change the ledger." title="Dispute">
          <ActionForm action={saveDispute} submitLabel="Record dispute" variant="secondary">
            <input name="firmId" type="hidden" value={voucher.firm_id} />
            <input name="partyId" type="hidden" value={voucher.party_id} />
            <input name="storeId" type="hidden" value={voucher.store_id ?? ""} />
            <input name="voucherId" type="hidden" value={voucher.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="What is disputed"><input className={inputClass} name="title" required /></Field>
              <Field label="Amount"><input className={inputClass} inputMode="decimal" name="amount" required /></Field>
              <Field label="Details"><input className={inputClass} name="details" /></Field>
            </div>
          </ActionForm>
        </Panel>
      ) : null}

      {canPost && !voucher.reverses_voucher_id ? (
        <Panel description="Posted entries are never edited or deleted. Reversing adds an opposite entry, undoes its adjustments and, for a purchase, frees the invoice to be entered again correctly." title="Reverse this entry">
          <ActionForm action={reverseEntry} className="flex flex-wrap items-end gap-3" submitLabel="Reverse" variant="secondary">
            <input name="voucherId" type="hidden" value={voucher.id} />
            <Field label="Reversal date"><input className={inputClass} defaultValue={indiaToday()} min={voucher.voucher_date} name="date" type="date" /></Field>
            <div className="min-w-64 flex-1"><Field label="Reason"><input className={inputClass} name="reason" required /></Field></div>
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
