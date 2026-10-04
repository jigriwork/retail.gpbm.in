import Link from "next/link";

import { AccessDenied } from "@/components/app/access-denied";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { ActionForm } from "@/components/accounts/action-form";
import { DocumentUploader } from "@/components/accounts/document-uploader";
import { Badge, Empty, Field, inputClass, Notice, Panel } from "@/components/accounts/fields";
import { getFinanceSession } from "@/lib/accounts/access";
import { money, shortDate } from "@/lib/accounts/format";
import { importGstr2b } from "@/lib/accounts/gst-actions";
import { gstImportedPeriods, gstr2bMatch, gstReturnDocuments } from "@/lib/accounts/ledger-queries";
import { listFirms, storesWithFirmToday } from "@/lib/accounts/queries";

const statusInfo: Record<string, { label: string; tone: "good" | "warn" | "bad" | "muted"; hint: string }> = {
  not_in_2b: { label: "Not in 2B", tone: "bad", hint: "The supplier has not reported these invoices yet. The tax credit cannot be claimed until they do: ask them to file GSTR-1." },
  amount_differs: { label: "Amounts differ", tone: "warn", hint: "Taxable value or tax differs by more than ₹1 between your entry and the supplier's filing. Check the invoice; ask the supplier to amend, or correct your entry." },
  not_in_books: { label: "Not in books", tone: "warn", hint: "The supplier reported these invoices to you, but they are not posted in Accounts. Enter them, or tell the supplier if they are not yours." },
  in_other_2b: { label: "In another month's 2B", tone: "muted", hint: "Reported late by the supplier; the credit comes in that month." },
  matched: { label: "Matched", tone: "good", hint: "Your entry and the supplier's filing agree." },
};
const order = ["not_in_2b", "amount_differs", "not_in_books", "in_other_2b", "matched"];

export default async function GstPage({ searchParams }: { searchParams: Promise<{ firm?: string; period?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="GST matching is visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const firms = await listFirms();
  const firm = firms.find((item) => item.id === params.firm) ?? firms[0];
  if (!firm) return <AccessDenied message="No billing firm yet." />;
  const periods = await gstImportedPeriods(firm.id);
  const period = params.period && /^(0[1-9]|1[0-2])\d{4}$/.test(params.period) ? params.period : periods[0] ?? null;
  const [rows, documents, uploadStores] = await Promise.all([
    period ? gstr2bMatch(firm.id, period) : Promise.resolve([]),
    gstReturnDocuments(),
    session.can.post ? storesWithFirmToday() : Promise.resolve([]),
  ]);
  const groups = order.map((status) => ({ status, items: rows.filter((row) => row.status === status) })).filter((group) => group.items.length);
  const atRisk = rows.filter((row) => row.status === "not_in_2b").reduce((sum, row) => sum + Number(row.books_tax ?? 0), 0);
  const label = (value: string) => `${value.slice(0, 2)}/${value.slice(2)}`;

  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/gst" session={session} />
      <AccountsHeader
        description="Compare the purchases posted here with GSTR-2B from the GST portal, so no input tax credit is missed: invoices the supplier has not filed, amounts that differ, and filings not entered in your books."
        title="GST matching (GSTR-2B)"
      />
      <nav aria-label="Firm" className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {firms.map((item) => (
          <Link aria-current={item.id === firm.id ? "page" : undefined}
            className={item.id === firm.id ? "shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white" : "shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted"}
            href={`/app/accounts/gst?firm=${item.id}`} key={item.id}>{item.name}</Link>
        ))}
      </nav>
      {firm.gstin ? null : <Notice>Enter {firm.name}&apos;s GSTIN under <Link className="font-semibold underline" href="/app/accounts/firms">Firms & stores</Link> before importing.</Notice>}

      {session.can.post ? (
        <Panel description="On the GST portal: Returns → GSTR-2B → choose the month → Download JSON. Upload it here (choose a store billed under this firm), then import it below." title="1. Store the GSTR-2B file">
          <DocumentUploader allowedKinds={["gst_return"]} parties={[]} stores={uploadStores.map((store) => ({ firmToday: store.firm?.name ?? null, id: store.id, name: store.name }))} />
        </Panel>
      ) : null}

      {session.can.post ? (
        <Panel title={`2. Import it for ${firm.name}`}>
          {documents.length ? (
            <ul className="space-y-2 text-sm">
              {documents.map((document) => (
                <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-3" key={document.id}>
                  <span>{document.file_name} · stored {shortDate(document.created_at.slice(0, 10))}</span>
                  <ActionForm action={importGstr2b} className="flex" submitLabel="Import" variant="secondary">
                    <input name="documentId" type="hidden" value={document.id} />
                    <input name="firmId" type="hidden" value={firm.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          ) : <Empty>No GSTR-2B file stored yet.</Empty>}
        </Panel>
      ) : null}

      <Panel
        action={periods.length ? (
          <form className="flex items-end gap-2" method="get">
            <input name="firm" type="hidden" value={firm.id} />
            <Field label="Return period">
              <select className={inputClass} defaultValue={period ?? ""} name="period">{periods.map((value) => <option key={value} value={value}>{label(value)}</option>)}</select>
            </Field>
            <button className="h-11 rounded-xl border border-border px-4 text-sm font-semibold">Show</button>
          </form>
        ) : undefined}
        description={period ? `Purchases dated in ${label(period)} against GSTR-2B for ${label(period)}.${atRisk ? ` Tax credit at risk: ${money(atRisk)}.` : ""}` : "Import a GSTR-2B file to see the match."}
        title={`${firm.name}${period ? ` · ${label(period)}` : ""}`}
      >
        {groups.length ? (
          <div className="space-y-3">
            {groups.map((group) => (
              <details className="rounded-2xl border border-border bg-background p-4" key={group.status} open={group.status !== "matched"}>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-semibold"><Badge tone={statusInfo[group.status].tone}>{statusInfo[group.status].label}</Badge>{group.items.length}</span>
                  <span className="text-sm text-muted">tax {money(group.items.reduce((sum, item) => sum + Number(item.books_tax ?? item.portal_tax ?? 0), 0))}</span>
                </summary>
                <p className="mt-2 text-xs leading-5 text-muted">{statusInfo[group.status].hint}</p>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted">
                      <tr><th className="py-1">Supplier</th><th>Invoice</th><th>Date</th><th className="text-right">Books taxable</th><th className="text-right">Books tax</th><th className="text-right">2B taxable</th><th className="text-right">2B tax</th><th className="pl-3">Note</th></tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr className="border-t border-border/60" key={`${item.supplier_gstin}|${item.doc_no}`}>
                          <td className="py-1.5">{item.supplier_name ?? item.supplier_gstin}<span className="block text-xs text-muted">{item.supplier_gstin}</span></td>
                          <td>{item.invoice_id ? <Link className="underline" href={`/app/accounts/purchases/${item.invoice_id}`}>{item.doc_no}</Link> : item.doc_no}</td>
                          <td>{item.doc_date ? shortDate(item.doc_date) : "—"}</td>
                          <td className="text-right">{item.books_taxable === null ? "—" : money(item.books_taxable)}</td>
                          <td className="text-right">{item.books_tax === null ? "—" : money(item.books_tax)}</td>
                          <td className="text-right">{item.portal_taxable === null ? "—" : money(item.portal_taxable)}</td>
                          <td className="text-right">{item.portal_tax === null ? "—" : money(item.portal_tax)}</td>
                          <td className="pl-3 text-xs text-muted">{item.other_period ? `In 2B ${label(item.other_period)}` : item.itc_available === false ? "Credit not available per portal" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        ) : <Empty>{period ? "No purchases or 2B invoices for this period." : "Nothing imported yet."}</Empty>}
      </Panel>
    </div>
  );
}
