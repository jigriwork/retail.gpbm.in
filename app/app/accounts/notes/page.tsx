import { AccessDenied } from "@/components/app/access-denied";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { Notice } from "@/components/accounts/fields";
import { SupplierEntry } from "@/components/accounts/supplier-entry";
import { getFinanceSession } from "@/lib/accounts/access";

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ firm?: string; party?: string; type?: string; store?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Credit and debit notes are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const type = params.type === "debit_note" ? "debit_note" : "credit_note";
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/notes" session={session} />
      <AccountsHeader
        description="Actual credit notes received from suppliers and debit notes you raised. Expected credits from company workings are tracked separately and never reduce the ledger until the real note is posted here."
        title="Credit and debit notes"
      />
      <Notice tone="info">
        If a credit note was already taken into account when a payment amount was agreed, post the note and set it against the same bill: the bill closes once, never twice.
      </Notice>
      <SupplierEntry base="/app/accounts/notes" firmId={params.firm} partyId={params.party} session={session} storeId={params.store} type={type} types={["credit_note", "debit_note"]} />
    </div>
  );
}
