"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

export function SyncNowButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      aria-label="Sync latest data"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className="shrink-0 px-3 sm:px-4"
      type="button"
      variant="secondary"
    >
      <RefreshCw className={isPending ? "size-4 animate-spin" : "size-4"} />
      <span className="hidden sm:inline">{isPending ? "Syncing" : "Sync now"}</span>
    </Button>
  );
}
