import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { ActionForm } from "@/components/accounts/action-form";
import { AccountsNav } from "@/components/accounts/accounts-nav";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { ImportLines } from "@/components/accounts/import-lines";
import { OpenDocument } from "@/components/accounts/open-document";
import { PurchaseHeaderFields } from "@/components/accounts/purchase-header-fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { documentKinds, labelFor, money, shortDate } from "@/lib/accounts/format";
import { addPurchaseLine, cancelPurchaseDraft, linkDocument, postPurchase, removePurchaseLines, savePurchaseDraft } from "@/lib/accounts/ledger-actions";
import { getPurchase, linkableDocuments } from "@/lib/accounts/ledger-queries";
import { listAllBrands, listAllParties, listFirms, storesWithFirmToday } from "@/lib/accounts/queries";
import { createClient } from "@/lib/supabase/server";

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span>{label}</span>
      <span className="flex items-center gap-2"><span className="text-muted">{detail}</span><Badge tone={ok ? "good" : "bad"}>{ok ? "agrees" : "check"}</Badge></span>
    </li>
  );
}

export default async function PurchasePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Purchases are visible to the owner and people with accounts access." />;
  const { invoiceId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(invoiceId)) notFound();
  const { invoice, lines, check, links } = await getPurchase(invoiceId);
  if (!invoice) notFound();
  const draft = invoice.status === "draft" && session.can.post;
  const [parties, firms, stores, brands, documents, profiles] = draft
    ? await Promise.all([
      listAllParties(), listFirms(), storesWithFirmToday(), listAllBrands(), linkableDocuments(invoice.store_id),
      (async () => (await (await createClient()).from("purchase_import_profiles").select("id,name,header_row,column_map,kind,verified").order("name")).data ?? [])(),
    ])
    : [[], [], [], [], [], []];
  const n = (key: string) => Number(check[key] ?? 0);
  const linkedIds = new Set(links.map((link) => link.finance_documents?.id));
  const sheets = documents.filter((document) => ["item_sheet", "purchase_export"].includes(document.kind));

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/purchases" session={session} />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <Link className="text-sm font-semibold text-muted" href="/app/accounts/purchases">← Purchases</Link>
        <h1 className="mt-2 text-3xl font-semibold">{invoice.parties?.legal_name} · {invoice.supplier_invoice_no}</h1>
        <p className="mt-2 text-sm text-muted">
          {shortDate(invoice.invoice_date)} · {invoice.stores?.name} · Billed under <strong className="text-foreground">{invoice.billing_firms?.name}</strong> · FY {invoice.financial_year}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge tone={invoice.status === "posted" ? "good" : invoice.status === "draft" ? "warn" : "muted"}>{invoice.status}</Badge>
          <Badge>{money(invoice.invoice_total)}</Badge>
          {invoice.due_date ? <Badge>Due {shortDate(invoice.due_date)}{invoice.due_date_source === "manual" ? " (entered)" : ""}</Badge> : null}
          {invoice.settlement_basis === "sales" ? <Badge tone="warn">Paid against sold stock: settled through company workings</Badge> : null}
          {invoice.voucher_id ? <Link className="text-sm font-semibold text-primary" href={`/app/accounts/vouchers/${invoice.voucher_id}`}>Open voucher →</Link> : null}
        </div>
      </section>

      <Panel description="The invoice header must add up to the paisa. Lines, when entered, must match the header within ₹1." title="Totals check">
        <ul className="divide-y divide-border">
          <CheckRow detail={`computed ${money(n("computed_total"))}`} label="Taxable + GST + freight + charges − discount + round off = invoice total" ok={Boolean(check.total_ok)} />
          <CheckRow detail={`${n("lines")} lines · ${money(n("line_taxable"))}`} label="Line taxable values = header taxable" ok={Boolean(check.taxable_ok)} />
          <CheckRow detail={check.lines_have_tax ? money(n("line_tax")) : "no tax on lines (checked on the invoice)"} label="Line GST = header GST" ok={Boolean(check.tax_ok)} />
          <CheckRow detail={`${n("line_qty")} pieces`} label="Line quantity = header quantity" ok={Boolean(check.qty_ok)} />
        </ul>
        {n("lines_without_brand") ? <p className="mt-2 text-sm text-muted">{n("lines_without_brand")} line(s) have no brand; brand-wise views will show them as “brand not set”.</p> : null}
      </Panel>

      {draft ? (
        <>
          <Panel title="Invoice header">
            <ActionForm action={savePurchaseDraft} submitLabel="Save header">
              <PurchaseHeaderFields firms={firms} invoice={invoice} parties={parties} stores={stores} />
            </ActionForm>
          </Panel>
          <Panel description="From the supplier's barcode sheet or the Logic purchase export. Columns are mapped by you; nothing is assumed." title="Import item lines">
            <ImportLines documents={sheets} invoiceId={invoice.id} partyId={invoice.party_id} profiles={profiles} />
          </Panel>
        </>
      ) : null}

      <Panel title={`Item lines (${lines.length})`}>
        {lines.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-1 pr-3">#</th><th className="pr-3">Brand</th><th className="pr-3">Article / barcode</th><th className="pr-3">Size</th><th className="pr-3 text-right">Qty</th><th className="pr-3 text-right">MRP</th><th className="pr-3 text-right">Rate</th><th className="pr-3 text-right">Taxable</th><th className="pr-3 text-right">GST</th>{draft ? <th /> : null}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.slice(0, 500).map((line) => (
                  <tr key={line.id}>
                    <td className="py-1 pr-3 text-muted">{line.line_no}</td>
                    <td className="pr-3">{line.brands?.name ?? <span className="text-muted">—</span>}</td>
                    <td className="pr-3">{line.article ?? line.description ?? ""}{line.barcode ? <span className="block text-xs text-muted">{line.barcode}</span> : null}</td>
                    <td className="pr-3">{line.size ?? ""}</td>
                    <td className="pr-3 text-right">{line.quantity}</td>
                    <td className="pr-3 text-right">{line.mrp ?? ""}</td>
                    <td className="pr-3 text-right">{line.unit_rate ?? ""}</td>
                    <td className="pr-3 text-right">{money(line.taxable_amount)}</td>
                    <td className="pr-3 text-right">{line.gst_rate !== null ? `${line.gst_rate}%` : ""} {Number(line.cgst_amount) + Number(line.sgst_amount) + Number(line.igst_amount) ? money(Number(line.cgst_amount) + Number(line.sgst_amount) + Number(line.igst_amount)) : ""}</td>
                    {draft ? (
                      <td>
                        <ActionForm action={removePurchaseLines} className="flex" submitLabel="Remove" variant="secondary">
                          <input name="invoiceId" type="hidden" value={invoice.id} /><input name="lineId" type="hidden" value={line.id} />
                        </ActionForm>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
            {lines.length > 500 ? <p className="mt-2 text-xs text-muted">Showing the first 500 of {lines.length} lines; totals above include all.</p> : null}
          </div>
        ) : <Empty>No item lines. A purchase can be posted on its header alone, but brand and barcode tracking need lines.</Empty>}
        {draft ? (
          <details className="mt-4 rounded-xl border border-dashed border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Add a line by hand</summary>
            <ActionForm action={addPurchaseLine} className="mt-3 space-y-3" submitLabel="Add line" variant="secondary">
              <input name="invoiceId" type="hidden" value={invoice.id} />
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Brand">
                  <select className={inputClass} name="brandId"><option value="">—</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
                </Field>
                <Field label="Article"><input className={inputClass} name="article" /></Field>
                <Field label="Barcode"><input className={inputClass} name="barcode" /></Field>
                <Field label="Size"><input className={inputClass} name="size" /></Field>
                <Field label="Colour"><input className={inputClass} name="colour" /></Field>
                <Field label="HSN"><input className={inputClass} name="hsn" /></Field>
                <Field label="Quantity"><input className={inputClass} inputMode="decimal" name="quantity" required /></Field>
                <Field label="MRP"><input className={inputClass} inputMode="decimal" name="mrp" /></Field>
                <Field label="Rate (per piece)"><input className={inputClass} inputMode="decimal" name="unitRate" /></Field>
                <Field label="Taxable (line)"><input className={inputClass} inputMode="decimal" name="taxable" /></Field>
                <Field label="GST %"><input className={inputClass} inputMode="decimal" name="gstRate" /></Field>
                <Field label="CGST"><input className={inputClass} inputMode="decimal" name="cgst" /></Field>
                <Field label="SGST"><input className={inputClass} inputMode="decimal" name="sgst" /></Field>
                <Field label="IGST"><input className={inputClass} inputMode="decimal" name="igst" /></Field>
              </div>
            </ActionForm>
          </details>
        ) : null}
        {draft && lines.length ? (
          <ActionForm action={removePurchaseLines} className="mt-3 flex" submitLabel="Remove all lines" variant="secondary">
            <input name="invoiceId" type="hidden" value={invoice.id} />
          </ActionForm>
        ) : null}
      </Panel>

      <Panel description="The supplier PDF, Logic export and item sheet all belong to this one purchase." title="Documents">
        {links.length ? (
          <ul className="mb-3 space-y-2 text-sm">
            {links.map((link) => link.finance_documents ? (
              <li className="flex flex-wrap items-center justify-between gap-2" key={link.id}>
                <span>{link.finance_documents.title ?? link.finance_documents.file_name} · {labelFor(documentKinds, link.finance_documents.kind)}</span>
                <OpenDocument id={link.finance_documents.id} />
              </li>
            ) : null)}
          </ul>
        ) : <div className="mb-3"><Empty>No documents attached.</Empty></div>}
        {draft || (session.can.post && invoice.status === "posted") ? (
          <ActionForm action={linkDocument} className="flex flex-wrap items-end gap-3" submitLabel="Attach" variant="secondary">
            <input name="entityType" type="hidden" value="purchase_invoice" />
            <input name="entityId" type="hidden" value={invoice.id} />
            <div className="min-w-64 flex-1">
              <Field label="Document">
                <select className={inputClass} name="documentId" required>
                  {(draft ? documents : []).filter((document) => !linkedIds.has(document.id)).map((document) => <option key={document.id} value={document.id}>{document.title ?? document.file_name} · {labelFor(documentKinds, document.kind)}</option>)}
                </select>
              </Field>
            </div>
          </ActionForm>
        ) : null}
        <p className="mt-2 text-xs text-muted">Upload new files under <Link className="underline" href="/app/accounts/documents">Documents</Link>.</p>
      </Panel>

      {draft ? (
        <Panel title="Post or cancel">
          {check.can_post ? <Notice tone="info">The totals agree. Posting creates one balanced purchase voucher and the supplier ledger entry. A posted purchase can only be corrected by reversal.</Notice> : <Notice>Posting is blocked until the totals agree.</Notice>}
          <div className="mt-3 flex flex-wrap gap-3">
            <ActionForm action={postPurchase} className="flex flex-wrap items-end gap-3" submitLabel="Post purchase">
              <input name="invoiceId" type="hidden" value={invoice.id} />
              {!lines.length ? (
                <Field label="Brand (no lines entered)">
                  <select className={inputClass} name="brandId"><option value="">Not set</option>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>
                </Field>
              ) : null}
            </ActionForm>
            <ActionForm action={cancelPurchaseDraft} className="flex" submitLabel="Cancel draft" variant="secondary">
              <input name="invoiceId" type="hidden" value={invoice.id} />
            </ActionForm>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
