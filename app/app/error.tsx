"use client";

export default function DataError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Data could not be loaded completely</h1>
      <p>Totals and recommendations are unavailable. Please retry before making decisions.</p>
      <button className="rounded-lg border px-4 py-2" onClick={reset}>Retry</button>
    </div>
  );
}
