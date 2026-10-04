// Reads the GSTR-2B JSON downloaded from the GST portal (Returns → GSTR-2B →
// Download JSON). Both the wrapped ({ data: { … } }) and plain layouts occur.
// B2B invoices and B2B credit/debit notes are read; each document's tax is
// the sum of its items.

export type Gstr2bRow = {
  supplier_gstin: string; supplier_name: string | null; doc_type: "invoice" | "credit_note" | "debit_note"; doc_no: string;
  doc_date: string | null; doc_value: number | null; taxable: number; igst: number; cgst: number; sgst: number; cess: number;
  itc_available: boolean | null; reason: string | null;
};

type Json = Record<string, unknown>;
const object = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : {});
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.map(object) : []);
const num = (value: unknown) => (typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, "")) || 0);
const gstinPattern = /^[0-9]{2}[A-Z0-9]{13}$/;

/** "25-09-2026" → "2026-09-25". */
function portalDate(value: unknown) {
  const match = String(value ?? "").match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

function totals(document: Json) {
  const items = list(document.items ?? document.itms);
  const sum = (key: string) => round(items.reduce((total, item) => total + num(object(item.itm_det ?? item)[key] ?? item[key]), 0));
  return items.length
    ? { taxable: sum("txval"), igst: sum("igst"), cgst: sum("cgst"), sgst: sum("sgst"), cess: sum("cess") }
    : { taxable: num(document.txval), igst: num(document.igst), cgst: num(document.cgst), sgst: num(document.sgst), cess: num(document.cess) };
}

export function parseGstr2b(input: unknown): { ok: true; gstin: string; period: string; rows: Gstr2bRow[] } | { ok: false; message: string } {
  const root = object(input);
  const data = object(root.data ?? root);
  const gstin = String(data.gstin ?? "").toUpperCase();
  const period = String(data.rtnprd ?? data.ret_period ?? "");
  if (!gstinPattern.test(gstin) || !/^(0[1-9]|1[0-2])\d{4}$/.test(period)) {
    return { ok: false, message: "This does not look like a GSTR-2B JSON from the GST portal (no GSTIN or return period)." };
  }
  const docdata = object(data.docdata);
  const rows: Gstr2bRow[] = [];
  for (const supplier of list(docdata.b2b)) {
    const supplierGstin = String(supplier.ctin ?? "").toUpperCase();
    if (!gstinPattern.test(supplierGstin)) continue;
    for (const invoice of list(supplier.inv)) {
      if (!invoice.inum) continue;
      rows.push({
        supplier_gstin: supplierGstin, supplier_name: supplier.trdnm ? String(supplier.trdnm).slice(0, 200) : null, doc_type: "invoice",
        doc_no: String(invoice.inum).trim().slice(0, 40), doc_date: portalDate(invoice.dt), doc_value: invoice.val === undefined ? null : num(invoice.val),
        ...totals(invoice), itc_available: invoice.itcavl === undefined ? null : invoice.itcavl === "Y", reason: invoice.rsn ? String(invoice.rsn).slice(0, 200) : null,
      });
    }
  }
  for (const supplier of list(docdata.cdnr)) {
    const supplierGstin = String(supplier.ctin ?? "").toUpperCase();
    if (!gstinPattern.test(supplierGstin)) continue;
    for (const note of list(supplier.nt)) {
      if (!note.ntnum) continue;
      rows.push({
        supplier_gstin: supplierGstin, supplier_name: supplier.trdnm ? String(supplier.trdnm).slice(0, 200) : null,
        doc_type: String(note.typ ?? "C").toUpperCase() === "D" ? "debit_note" : "credit_note",
        doc_no: String(note.ntnum).trim().slice(0, 40), doc_date: portalDate(note.dt), doc_value: note.val === undefined ? null : num(note.val),
        ...totals(note), itc_available: note.itcavl === undefined ? null : note.itcavl === "Y", reason: note.rsn ? String(note.rsn).slice(0, 200) : null,
      });
    }
  }
  return { ok: true, gstin, period, rows };
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
