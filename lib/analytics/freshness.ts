export type DataFreshness = {
  generatedAt: string | null;
  latestUploadedAt: string | null;
  slaDays: number;
  sourceFromDate?: string | null;
  sourceThroughDate: string | null;
  stale: boolean;
};

function indiaDate(value: string) {
  return new Date(`${value.slice(0, 10)}T00:00:00+05:30`);
}

export function buildFreshness(input: {
  generated_at?: string | null;
  latest_uploaded_at?: string | null;
  sla_days?: number | null;
  source_from_date?: string | null;
  source_through_date?: string | null;
  source_through_month?: string | null;
}): DataFreshness {
  const sourceThroughDate = input.source_through_date ?? input.source_through_month ?? null;
  const slaDays = Math.max(0, Number(input.sla_days ?? 2));
  const ageDays = sourceThroughDate
    ? Math.floor((Date.now() - indiaDate(sourceThroughDate).getTime()) / 86_400_000)
    : Number.POSITIVE_INFINITY;

  return {
    generatedAt: input.generated_at ?? null,
    latestUploadedAt: input.latest_uploaded_at ?? null,
    slaDays,
    sourceFromDate: input.source_from_date ?? null,
    sourceThroughDate,
    stale: ageDays > slaDays,
  };
}
