import { createClient } from "@/lib/supabase/server";

export async function ImportStatus() {
  const client = await createClient();
  const { data, error } = await client.from("report_imports")
    .select("id,file_name,status,failure_message,created_at")
    .in("status", ["processing", "failed"]).order("created_at", { ascending: false }).limit(10);
  if (error) return <p role="alert">Import status is unavailable. Please retry before uploading again.</p>;
  if (!data?.length) return null;
  return (
    <section aria-label="Unfinished imports" className="rounded-2xl border border-border p-4">
      <h2 className="font-semibold">Unfinished imports</h2>
      <ul className="mt-2 space-y-2 text-sm">
        {data.map(run => <li key={run.id}>
          <strong>{run.file_name}</strong>: {run.status === "failed" ? "Failed" : "Processing"}.
          {" "}{run.failure_message ?? "No partial report is published. Retry the same file if this upload was interrupted."}
        </li>)}
      </ul>
    </section>
  );
}
