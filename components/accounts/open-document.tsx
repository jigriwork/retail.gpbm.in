"use client";

import { useState } from "react";

import { financeDocumentLink } from "@/lib/accounts/document-actions";

export function OpenDocument({ id }: { id: string }) {
  const [error, setError] = useState("");
  return (
    <span>
      <button
        className="text-sm font-semibold text-primary"
        onClick={async () => {
          setError("");
          const result = await financeDocumentLink(id);
          if (result.ok && result.url) window.open(result.url, "_blank", "noopener,noreferrer");
          else setError(result.message ?? "Could not open.");
        }}
        type="button"
      >
        Open original
      </button>
      {error ? <span className="ml-2 text-xs text-danger">{error}</span> : null}
    </span>
  );
}
