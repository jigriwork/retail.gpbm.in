import { AccessDenied } from "@/components/app/access-denied";
import { OwnerToolsNav, PageHeader } from "@/components/owner/owner-tools-nav";
import { SopForm } from "@/components/sops/sop-form";
import { getAccessibleStores, requireOwner } from "@/lib/auth/session";

export default async function NewSopPage() {
  const owner = await requireOwner();
  if (!owner) return <AccessDenied message="Only owners can create SOPs." />;
  const stores = await getAccessibleStores(owner.profile);
  return (
    <div className="space-y-5">
      <OwnerToolsNav active="/app/sops" />
      <PageHeader description="Keep it to the few steps a manager can follow on a busy day." eyebrow="Store SOPs" title="New SOP" />
      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <SopForm defaults={{}} stores={stores} />
      </section>
    </div>
  );
}
