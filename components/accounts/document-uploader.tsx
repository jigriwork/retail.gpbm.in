"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Upload } from "lucide-react";

import { Field, inputClass } from "@/components/accounts/fields";
import { Button } from "@/components/ui/button";
import { finalizeFinanceDocument, reserveFinanceDocument } from "@/lib/accounts/document-actions";
import { documentKinds } from "@/lib/accounts/format";
import { createClient } from "@/lib/supabase/client";

const byExtension: Record<string, string> = {
  csv: "text/csv", jpeg: "image/jpeg", jpg: "image/jpeg", pdf: "application/pdf", png: "image/png", webp: "image/webp",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const knownTypes = new Set(Object.values(byExtension));

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function DocumentUploader({
  allowedKinds,
  parties,
  stores,
}: {
  allowedKinds: string[];
  parties: Array<{ id: string; legal_name: string }>;
  stores: Array<{ id: string; name: string; firmToday: string | null }>;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const firm = stores.find((store) => store.id === storeId)?.firmToday;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) {
      setMessage({ ok: false, text: "Choose the file to upload." });
      return;
    }
    setBusy(true);
    setMessage({ ok: true, text: "Checking the file…" });
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const mime = knownTypes.has(file.type) ? file.type : byExtension[extension] ?? file.type;
      const reservation = await reserveFinanceDocument({
        docDate: String(data.get("docDate") ?? ""),
        docNo: String(data.get("docNo") ?? ""),
        fileName: file.name,
        firmId: "",
        kind: String(data.get("kind") ?? ""),
        mime,
        partyId: String(data.get("partyId") ?? ""),
        sha256: await sha256(file),
        size: file.size,
        storeId: String(data.get("storeId") ?? ""),
        title: String(data.get("title") ?? ""),
      });
      if (!reservation.ok) {
        setMessage({ ok: false, text: reservation.message });
        return;
      }
      setMessage({ ok: true, text: "Uploading…" });
      const { error } = await createClient().storage.from("finance-docs").upload(reservation.path, file, { contentType: mime, upsert: false });
      if (error) {
        setMessage({ ok: false, text: "Upload failed. Check your connection and try again." });
        return;
      }
      const result = await finalizeFinanceDocument(reservation.id);
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: "Something went wrong. Nothing was saved twice; try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Document">
          <select className={inputClass} name="kind">
            {documentKinds.filter((kind) => allowedKinds.includes(kind.value)).map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </Field>
        <Field hint={firm ? `Billed under: ${firm} (checked against the document date)` : "Billed under: to confirm from the document"} label="Store">
          <select className={inputClass} name="storeId" onChange={(event) => setStoreId(event.target.value)} value={storeId}>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </Field>
        {parties.length ? (
          <Field label="Supplier (if known)">
            <select className={inputClass} name="partyId">
              <option value="">Not sure yet</option>
              {parties.map((party) => <option key={party.id} value={party.id}>{party.legal_name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Short description"><input className={inputClass} name="title" placeholder="Pepe invoice PJ-26" /></Field>
        <Field label="Document number"><input className={inputClass} name="docNo" placeholder="PJ-26" /></Field>
        <Field label="Document date"><input className={inputClass} name="docDate" type="date" /></Field>
      </div>
      <Field hint="PDF, photo, Excel or CSV, up to 20 MB. The original is kept permanently." label="File">
        <input accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv" className="block w-full text-sm" name="file" type="file" />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Upload document</Button>
        {message ? <p className={message.ok ? "text-sm font-medium text-success" : "text-sm font-medium text-danger"} role="status">{message.text}</p> : null}
      </div>
    </form>
  );
}
