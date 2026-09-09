import "server-only";

// Detail retrieval must never inherit PostgREST's implicit result cap. A stable
// primary-key tie-breaker preserves deterministic order across page boundaries.
// Fail the whole calculation on any error; callers must not turn it into zero.
export async function completeQuery<Row>(query: {
  order(column: string, options?: { ascending?: boolean }): unknown;
  range(from: number, to: number): PromiseLike<{ data: Row[] | null; error: { message: string } | null; count: number | null }>;
}) {
  query.order("id", { ascending: true });
  const data: Row[] = [];
  let expected: number | null = null;
  for (let offset = 0; ; ) {
    const result = await query.range(offset, offset + 999);
    if (result.error || !result.data) throw new Error("Complete data could not be loaded. Please retry; totals are unavailable.");
    if (result.count === null || !Number.isSafeInteger(result.count) || result.count < 0 ||
        (expected !== null && expected !== result.count)) {
      throw new Error("The dataset changed or its completeness could not be verified. Please retry.");
    }
    expected = result.count;
    data.push(...result.data);
    if (data.length === expected) return { data, error: null };
    if (!result.data.length || data.length > expected) throw new Error("Incomplete data returned. Please retry.");
    offset += result.data.length;
  }
}

export async function checkedQuery<Result extends { error: unknown }>(query: PromiseLike<Result>): Promise<Result> {
  const result = await query;
  if (result.error) throw new Error("Data could not be loaded. Please retry; totals are unavailable.");
  return result;
}
