"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Check, Field, inputClass } from "@/components/accounts/fields";
import { Button } from "@/components/ui/button";
import { type ColumnMap, type ImportField, importFields } from "@/lib/accounts/format";
import { importPurchaseLines, previewImportSheet } from "@/lib/accounts/import-actions";

type Preview = { headers: string[]; sample: string[][]; rowCount: number };

export function ImportLines({ documents, invoiceId, partyId, profiles }: {
  documents: Array<{ id: string; title: string | null; file_name: string; kind: string }>;
  invoiceId: string;
  partyId: string;
  profiles: Array<{ id: string; name: string; header_row: number; column_map: unknown; kind: string; verified: boolean }>;
}) {
  const router = useRouter();
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [headerRow, setHeaderRow] = useState(1);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const kind = documents.find((document) => document.id === documentId)?.kind === "purchase_export" ? "purchase_export" : "item_sheet";

  async function load() {
    setBusy(true); setMessage(null);
    const result = await previewImportSheet(documentId, headerRow);
    setBusy(false);
    if (!result.ok) { setMessage({ ok: false, text: result.message }); return; }
    setPreview(result);
    // Suggest columns only where the header names the field plainly; the user confirms every mapping.
    const guess: ColumnMap = {};
    const find = (...names: string[]) => result.headers.find((header) => names.some((name) => header.toLowerCase().replace(/[^a-z]/g, "") === name));
    guess.quantity = find("qty", "quantity", "pcs");
    guess.barcode = find("barcode", "ean");
    guess.mrp = find("mrp");
    guess.size = find("size");
    guess.hsn = find("hsn", "hsncode");
    setMap(Object.fromEntries(Object.entries(guess).filter(([, value]) => value)) as ColumnMap);
  }

  async function run(form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true); setMessage(null);
    const result = await importPurchaseLines({
      documentId, headerRow, invoiceId, kind, map, partyId, replace: data.get("replace") === "on", saveAs: String(data.get("saveAs") ?? ""),
    });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  if (!documents.length) return <p className="text-sm text-muted">Upload the item sheet or Logic purchase export under Documents first, then import it here.</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Sheet">
          <select className={inputClass} onChange={(event) => { setDocumentId(event.target.value); setPreview(null); }} value={documentId}>
            {documents.map((document) => <option key={document.id} value={document.id}>{document.title ?? document.file_name}</option>)}
          </select>
        </Field>
        <Field label="Header row number">
          <input className={inputClass} max={50} min={1} onChange={(event) => setHeaderRow(Number(event.target.value) || 1)} type="number" value={headerRow} />
        </Field>
        {profiles.length ? (
          <Field label="Saved mapping">
            <select className={inputClass} defaultValue="" onChange={(event) => {
              const profile = profiles.find((item) => item.id === event.target.value);
              if (profile) { setHeaderRow(profile.header_row); setMap(profile.column_map as ColumnMap); }
            }}>
              <option value="">—</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.verified ? "" : " (not verified)"}</option>)}
            </select>
          </Field>
        ) : null}
      </div>
      <Button disabled={busy || !documentId} onClick={load} type="button" variant="secondary">{busy ? <Loader2 className="size-4 animate-spin" /> : null}Read sheet</Button>
      {preview ? (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void run(event.currentTarget); }}>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-xs">
              <thead><tr>{preview.headers.map((header, index) => <th className="whitespace-nowrap border-b border-border px-2 py-1 text-left" key={index}>{header}</th>)}</tr></thead>
              <tbody>{preview.sample.map((row, rowIndex) => <tr key={rowIndex}>{preview.headers.map((_, index) => <td className="whitespace-nowrap px-2 py-1 text-muted" key={index}>{row[index] ?? ""}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{preview.rowCount} rows below the header. Choose which column holds each field; leave unknown fields empty. A GST class such as “GST APPAREL” is not a rate.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {importFields.map((field) => (
              <Field key={field.value} label={field.label}>
                <select className={inputClass} onChange={(event) => setMap((current) => ({ ...current, [field.value as ImportField]: event.target.value || undefined }))} value={map[field.value as ImportField] ?? ""}>
                  <option value="">—</option>
                  {preview.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <Check label="Replace the lines already on this purchase" name="replace" />
          <Field hint="Optional. Saved mappings stay “not verified” until the owner confirms them." label="Save this mapping as"><input className={inputClass} name="saveAs" placeholder="Pepe item sheet" /></Field>
          <Button disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}Add lines</Button>
        </form>
      ) : null}
      {message ? <p className={message.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"} role="status">{message.text}</p> : null}
    </div>
  );
}
