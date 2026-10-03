import { AccessDenied } from "@/components/app/access-denied";
import { AccountsHeader, AccountsNav } from "@/components/accounts/accounts-nav";
import { DocumentUploader } from "@/components/accounts/document-uploader";
import { Badge, Empty, Pager, Panel } from "@/components/accounts/fields";
import { OpenDocument } from "@/components/accounts/open-document";
import { DocumentReviewForm } from "@/components/accounts/review-form";
import { getFinanceSession } from "@/lib/accounts/access";
import { documentKinds, labelFor, managerDocumentKinds, money, shortDate } from "@/lib/accounts/format";
import { listAllParties, listDocuments, listFinanceStores, listFirms, storesWithFirmToday } from "@/lib/accounts/queries";
import { getAccessibleStores } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { indiaToday } from "@/lib/accounts/format";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getFinanceSession();
  if (!session.can.view && !session.canSubmitDocuments) return <AccessDenied message="Accounts documents are for the owner, accountants and store managers." />;
  const page = Math.max(0, Number((await searchParams).page) || 0);
  const finance = session.can.view;

  let uploadStores: Array<{ id: string; name: string; firmToday: string | null }>;
  if (finance) {
    uploadStores = (await storesWithFirmToday()).map((store) => ({ firmToday: store.firm?.name ?? null, id: store.id, name: store.name }));
  } else {
    const supabase = await createClient();
    const today = indiaToday();
    const stores = await getAccessibleStores(session.profile);
    uploadStores = await Promise.all(stores.map(async (store) => {
      const { data } = await supabase.rpc("store_billing_firm_label", { p_date: today, p_store: store.id });
      return { firmToday: data ?? null, id: store.id, name: store.name };
    }));
  }
  const [{ documents, total, pageSize }, parties, firms, stores] = await Promise.all([
    listDocuments(page),
    finance ? listAllParties() : Promise.resolve([]),
    finance ? listFirms() : Promise.resolve([]),
    finance ? listFinanceStores() : Promise.resolve([]),
  ]);
  const allowedKinds = session.can.post ? documentKinds.map((kind) => kind.value as string) : managerDocumentKinds;

  return (
    <div className="space-y-5">
      {finance ? <AccountsNav active="/app/accounts/documents" session={session} /> : null}
      <AccountsHeader
        description="Supplier invoices, purchase files, credit notes, statements and return papers. Originals are stored privately and can never be replaced or deleted; the same file is never stored twice."
        title="Documents"
      />
      {uploadStores.length ? (
        <Panel title="Upload a document">
          <DocumentUploader allowedKinds={allowedKinds} parties={parties} stores={uploadStores} />
        </Panel>
      ) : null}
      <Panel title={finance ? "All documents" : "Documents you submitted"}>
        {documents.length ? (
          <div className="space-y-3">
            {documents.map((document) => (
              <div className="rounded-2xl border border-border bg-background p-4" key={document.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{document.title ?? document.file_name}</p>
                    <p className="text-sm text-muted">
                      {labelFor(documentKinds, document.kind)}{document.doc_no ? ` · ${document.doc_no}` : ""}{document.doc_date ? ` · ${shortDate(document.doc_date)}` : ""}
                      {document.amount !== null ? ` · ${money(document.amount)}` : ""}{document.stores?.name ? ` · ${document.stores.name}` : ""}{document.parties?.legal_name ? ` · ${document.parties.legal_name}` : ""}
                    </p>
                    <p className="mt-1 text-sm">Billed under: {document.billing_firms?.name ? <strong>{document.billing_firms.name}</strong> : <Badge tone="warn">to confirm</Badge>}</p>
                  </div>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={document.status === "reviewed" ? "good" : document.status === "rejected" ? "bad" : "warn"}>{document.status === "stored" ? "not reviewed" : document.status}</Badge>
                    <OpenDocument id={document.id} />
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">Submitted {shortDate(document.created_at)} by {document.submitted_role}{document.notes ? ` · ${document.notes}` : ""}</p>
                {session.can.post ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-primary">Review details</summary>
                    <DocumentReviewForm document={document} firms={firms} parties={parties} stores={stores} />
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        ) : <Empty>No documents yet.</Empty>}
        <Pager base="/app/accounts/documents" page={page} pageSize={pageSize} total={total} />
      </Panel>
    </div>
  );
}
