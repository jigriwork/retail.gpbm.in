import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck, ImageIcon } from "lucide-react";

import { AccessDenied } from "@/components/app/access-denied";
import { ManagerUpdateForm } from "@/components/updates/update-form";
import { UpdateStatusActions } from "@/components/updates/status-actions";
import { updateManagerUpdate } from "@/lib/updates/actions";
import { getAccessibleStores, requireProfile } from "@/lib/auth/session";
import { getManagerUpdate, getUpdatePhotoUrl } from "@/lib/updates/queries";

function label(value: string | null | undefined, fallback: string) {
  return value ? value.replaceAll("_", " ") : fallback;
}

function displayTime(value: string | null) {
  if (!value) {
    return "No time";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export default async function UpdateDetailPage({
  params,
}: {
  params: Promise<{ updateId: string }>;
}) {
  const { updateId } = await params;
  const { profile } = await requireProfile();
  const stores = await getAccessibleStores(profile);
  const activeStoreIds = new Set(stores.map((store) => store.id));
  const update = await getManagerUpdate(updateId);

  if (!update) {
    notFound();
  }

  if (!update.store_id || !activeStoreIds.has(update.store_id)) {
    return <AccessDenied message="This store update is not assigned to your account." />;
  }

  const photoUrl = await getUpdatePhotoUrl(update.photo_path);

  return (
    <div className="space-y-5">
      <div>
        <Link className="text-sm font-semibold text-muted" href="/app/updates">
          Back to updates
        </Link>
        <h1 className="mt-2 text-3xl font-semibold">{update.title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {update.stores?.name ?? "Store"} · {displayTime(update.created_at)}
        </p>
      </div>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 text-xs font-semibold capitalize text-muted">
          <span className="rounded-full border border-border px-3 py-1">
            {update.category ?? "Other"}
          </span>
          <span className="rounded-full border border-border px-3 py-1">
            {label(update.urgency, "normal")}
          </span>
          <span className="rounded-full border border-border px-3 py-1">
            {label(update.status, "open")}
          </span>
        </div>

        {update.details ? (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-muted">
            {update.details}
          </p>
        ) : (
          <p className="mt-5 text-sm leading-6 text-muted">No extra details added.</p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Created by</p>
            <p className="mt-1 font-semibold">
              {update.created_profile?.full_name ?? update.created_profile?.email ?? "Unknown"}
            </p>
          </div>
          <div className="rounded-2xl border border-border p-3">
            <p className="text-xs font-medium text-muted">Linked task</p>
            {update.created_task ? (
              <Link
                className="mt-1 inline-flex items-center gap-2 font-semibold"
                href={`/app/tasks/${update.created_task.id}`}
              >
                <ClipboardCheck className="size-3" />
                {update.created_task.status ?? "pending"}
              </Link>
            ) : (
              <p className="mt-1 font-semibold">None</p>
            )}
          </div>
        </div>

        {photoUrl ? (
          <Link
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-border px-4 text-sm font-semibold transition hover:bg-black/[0.03]"
            href={photoUrl}
            target="_blank"
          >
            <ImageIcon className="size-4" />
            View photo
          </Link>
        ) : null}

        <div className="mt-5">
          <UpdateStatusActions updateId={update.id} />
        </div>
      </section>

      <section className="rounded-[1.35rem] border border-border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Edit update</h2>
        <div className="mt-4">
          <ManagerUpdateForm
            action={updateManagerUpdate}
            assignableUsers={[]}
            defaultStoreId={update.store_id}
            mode="edit"
            stores={stores}
            update={update}
          />
        </div>
      </section>
    </div>
  );
}
