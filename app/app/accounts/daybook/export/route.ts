import { getFinanceSession } from "@/lib/accounts/access";
import { monthRange } from "@/lib/accounts/ledger-queries";
import { createClient } from "@/lib/supabase/server";

// Day book for one firm and month as accounting lines (one row per debit or
// credit), for the CA or for importing into Tally through its Excel import.
const ledgerNames: Record<string, string> = {
  supplier: "", purchases: "Purchase", input_cgst: "Input CGST", input_sgst: "Input SGST", input_igst: "Input IGST",
  freight: "Freight Inward", other_charges: "Other Charges", discount_received: "Discount Received", round_off: "Round Off",
  bank: "Bank", cash: "Cash", purchase_returns: "Purchase Returns", claims_income: "Claims & Schemes Received",
  opening_balance: "Opening Balance", supplier_transfer: "Supplier Transfer",
};

export async function GET(request: Request) {
  const session = await getFinanceSession();
  if (!session.can.view) return new Response("Not allowed", { status: 403 });
  const url = new URL(request.url);
  const firmId = url.searchParams.get("firm") ?? "";
  const { from, month, to } = monthRange(url.searchParams.get("month") ?? undefined);
  const supabase = await createClient();
  const { data: firm } = await supabase.from("billing_firms").select("id,name").eq("id", firmId).maybeSingle();
  if (!firm) return new Response("Choose a firm", { status: 400 });
  const { data: vouchers, error } = await supabase.from("vouchers")
    .select("id,voucher_no,voucher_type,voucher_date,reference_no,narration,status,stores(name),voucher_lines(line_no,account,debit,credit,description,parties(legal_name))")
    .eq("firm_id", firm.id).gte("voucher_date", from).lte("voucher_date", to).eq("status", "posted")
    .order("voucher_date").order("voucher_no").limit(5000);
  if (error) return new Response("Could not load the day book", { status: 500 });
  const cell = (value: string | number | null | undefined) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) || /^[=+\-@]/.test(text) ? `"${text.replace(/^([=+\-@])/, "'$1").replaceAll('"', '""')}"` : text;
  };
  const rows: Array<Array<string | number | null>> = [["Date", "Voucher no", "Voucher type", "Store", "Ledger", "Debit", "Credit", "Reference", "Narration"]];
  for (const voucher of vouchers ?? []) {
    for (const line of [...(voucher.voucher_lines ?? [])].sort((a, b) => a.line_no - b.line_no)) {
      rows.push([
        voucher.voucher_date, voucher.voucher_no, voucher.voucher_type, voucher.stores?.name ?? "",
        line.account === "supplier" ? line.parties?.legal_name ?? "Supplier" : ledgerNames[line.account] ?? line.account,
        Number(line.debit) ? Number(line.debit).toFixed(2) : "", Number(line.credit) ? Number(line.credit).toFixed(2) : "",
        voucher.reference_no, line.description ?? voucher.narration,
      ]);
    }
  }
  const name = `daybook-${firm.name.replace(/[^A-Za-z0-9]+/g, "-")}-${month}.csv`;
  return new Response(rows.map((row) => row.map(cell).join(",")).join("\n") + "\n", {
    headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="${name}"`, "Content-Type": "text/csv; charset=utf-8" },
  });
}
