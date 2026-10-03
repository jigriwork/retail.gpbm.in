import { AccessDenied } from "@/components/app/access-denied";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { SupplierEntry } from "@/components/accounts/supplier-entry";
import { getFinanceSession } from "@/lib/accounts/access";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ firm?: string; party?: string; type?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view) return <AccessDenied message="Payments are visible to the owner and people with accounts access." />;
  const params = await searchParams;
  const type = ["payment", "receipt", "opening"].includes(params.type ?? "") ? params.type! : "payment";
  return (
    <div className="space-y-5">
      <AccountsNav active="/app/accounts/payments" session={session} />
      <AccountsHeader
        description="Payments, advances, refunds and opening balances for one supplier in one billing firm. A payment can cover several bills or brands; what is not set against a bill stays as an advance."
        title="Payments and advances"
      />
      <SupplierEntry base="/app/accounts/payments" firmId={params.firm} partyId={params.party} session={session} type={type} types={["payment", "receipt", "opening"]} />
    </div>
  );
}
