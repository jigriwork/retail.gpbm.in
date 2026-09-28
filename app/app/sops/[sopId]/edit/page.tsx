import { notFound } from "next/navigation";

import { AccessDenied } from "@/components/app/access-denied";
import { OwnerToolsNav } from "@/components/owner/owner-tools-nav";
import { SopForm } from "@/components/sops/sop-form";
import { getAccessibleStores, requireOwner } from "@/lib/auth/session";
import { formatSopSteps, shortDate } from "@/lib/owner/phase2-shared";
import { getSopForEdit } from "@/lib/sops/queries";

export default async function EditSopPage({
  params,
  searchParams,
}: {
  params: Promise<{ sopId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const owner = await requireOwner();
  if (!owner) return <AccessDenied message="Only owners can edit SOPs." />;
  const [{ sopId }, { saved }] = await Promise.all([params, searchParams]);
  const [loaded, stores] = await Promise.all([getSopForEdit(sopId), getAccessibleStores(owner.profile)]);
  if (!loaded) notFound();
  const { revisions, sop } = loaded;

  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/sops" />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <p className="text-sm font-medium text-muted">Edit SOP · version {sop.version}{saved ? " · saved" : ""}</p>
        <h1 className="mt-2 text-3xl font-semibold">{sop.title}</h1>
      </section>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <SopForm
          defaults={{ ...sop, steps: formatSopSteps(sop.steps) }}
          stores={stores}
        />
      </section>
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="mb-3 text-xl font-semibold">Earlier versions</h2>
        {revisions.length ? (
          <ul className="space-y-2 text-sm">
            {revisions.map((revision) => {
              const changer = revision.changer as { full_name: string | null; email: string | null } | null;
              return (
                <li key={revision.id}>
                  <details>
                    <summary className="cursor-pointer">
                      Version {revision.version} · replaced {shortDate(revision.changed_at)}
                      {changer ? ` by ${changer.full_name ?? changer.email}` : ""}
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-3 text-xs">
                      {formatSopSteps((revision.snapshot as { steps?: unknown }).steps)}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">No earlier versions yet.</p>
        )}
      </section>
    </div>
  );
}
