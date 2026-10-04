// Incentive maths, shared by the page, the payroll export and the tests.
//
// Basis "sales_amount": slabs start at a monthly net sale in rupees.
// Basis "target_pct": slabs start at a % of the salesperson's monthly target.
// Payout "whole": the rate of the highest slab reached applies to the whole sale.
// Payout "marginal" (sales_amount only): each slab's rate applies to the part of
// the sale inside that slab, like income-tax slabs.

export type Slab = { from: number; rate: number };
export type Scheme = { basis: "sales_amount" | "target_pct"; payout: "whole" | "marginal"; slabs: Slab[]; min_bills: number };

export function sortedSlabs(slabs: Slab[]) {
  return [...slabs].filter((slab) => Number.isFinite(slab.from) && Number.isFinite(slab.rate)).sort((a, b) => a.from - b.from);
}

/** Incentive in rupees (2 decimals) for one salesperson's month. */
export function incentiveFor(scheme: Scheme, { bills, netSale, target }: { bills: number; netSale: number; target: number | null }) {
  if (netSale <= 0 || bills < scheme.min_bills) return 0;
  const slabs = sortedSlabs(scheme.slabs);
  if (!slabs.length) return 0;
  if (scheme.basis === "target_pct") {
    if (!target || target <= 0) return 0;
    const achieved = (netSale / target) * 100;
    const slab = slabs.filter((item) => item.from <= achieved).at(-1);
    return round((netSale * (slab?.rate ?? 0)) / 100);
  }
  if (scheme.payout === "marginal") {
    let total = 0;
    slabs.forEach((slab, index) => {
      const upper = slabs[index + 1]?.from ?? Number.POSITIVE_INFINITY;
      const portion = Math.max(0, Math.min(netSale, upper) - slab.from);
      total += (portion * slab.rate) / 100;
    });
    return round(total);
  }
  const slab = slabs.filter((item) => item.from <= netSale).at(-1);
  return round((netSale * (slab?.rate ?? 0)) / 100);
}

/** Next slab still to reach, for "₹X more to reach the next slab". */
export function nextSlab(scheme: Scheme, { netSale, target }: { netSale: number; target: number | null }) {
  const slabs = sortedSlabs(scheme.slabs);
  if (scheme.basis === "target_pct") {
    if (!target) return null;
    const achieved = (netSale / target) * 100;
    const next = slabs.find((slab) => slab.from > achieved);
    return next ? { rate: next.rate, gap: round((next.from / 100) * target - netSale) } : null;
  }
  const next = slabs.find((slab) => slab.from > netSale);
  return next ? { rate: next.rate, gap: round(next.from - netSale) } : null;
}

/** "0:0, 100000:1, 200000:1.5" → slabs; null when malformed. */
export function parseSlabs(text: string): Slab[] | null {
  const parts = text.split(/[,\n]+/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts.length > 10) return null;
  const slabs: Slab[] = [];
  for (const part of parts) {
    const match = part.replace(/[₹%\s]/g, "").match(/^(\d+(?:\.\d+)?)[:=](\d+(?:\.\d+)?)$/);
    if (!match) return null;
    const slab = { from: Number(match[1]), rate: Number(match[2]) };
    if (slab.rate > 20) return null;
    slabs.push(slab);
  }
  return sortedSlabs(slabs);
}

export function slabsText(slabs: Slab[]) {
  return sortedSlabs(slabs).map((slab) => `${slab.from}:${slab.rate}`).join(", ");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
