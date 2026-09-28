import type { DecisionEvidence, DecisionWindow } from "@/lib/owner/decisions";
import { causationNote, formatPercent, formatRupees, shortDate, verdictLabels } from "@/lib/owner/phase2-shared";

const toneByVerdict: Record<string, string> = {
  declined: "border-danger/40 text-danger",
  improved: "border-success/40 text-success",
};

function windowValue(window: DecisionWindow, measureType?: string) {
  if (measureType === "store_bills") return `${window.value} bills/day`;
  if (measureType === "store_average_bill") return `${formatRupees(window.value)} per bill`;
  return `${formatRupees(window.value)}/day`;
}

export function DecisionEvidencePanel({ evidence, title }: { evidence: DecisionEvidence | null; title: string }) {
  if (!evidence) return null;
  const verdict = evidence.verdict ?? "insufficient_data";
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${toneByVerdict[verdict] ?? "border-border text-muted"}`}>
          {verdictLabels[verdict] ?? verdict}
        </span>
      </div>
      {evidence.explanation ? <p className="mt-2 text-sm leading-6">{evidence.explanation}</p> : null}
      {evidence.trial && evidence.comparison ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="py-1 pr-3 font-semibold">Period</th>
                <th className="py-1 pr-3 font-semibold">Dates</th>
                <th className="py-1 pr-3 font-semibold">Sales days loaded</th>
                <th className="py-1 font-semibold">Measure</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Before (comparison)", evidence.comparison],
                ["Trial", evidence.trial],
              ].map(([label, window]) => {
                const item = window as DecisionWindow;
                return (
                  <tr className="border-t border-border" key={label as string}>
                    <td className="py-1.5 pr-3 font-semibold">{label as string}</td>
                    <td className="py-1.5 pr-3">{shortDate(item.start)} – {shortDate(item.end)}</td>
                    <td className="py-1.5 pr-3">{item.covered_store_days}/{item.expected_store_days}</td>
                    <td className="py-1.5">{windowValue(item, evidence.measure_type)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {evidence.change_ratio !== null && evidence.change_ratio !== undefined ? (
            <p className="mt-2 text-xs font-semibold">Change: {formatPercent(evidence.change_ratio)}</p>
          ) : null}
        </div>
      ) : null}
      {evidence.caveat ? <p className="mt-3 text-xs leading-5 text-muted">{evidence.caveat}</p> : null}
      {evidence.basis === "data" ? <p className="mt-1 text-xs font-semibold leading-5">{causationNote}</p> : null}
    </div>
  );
}
