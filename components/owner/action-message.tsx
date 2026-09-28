export function ActionMessage({ state }: { state: { ok: boolean; message: string } }) {
  return state.message ? (
    <p aria-live="polite" className={state.ok ? "text-xs font-medium text-success" : "text-xs font-medium text-danger"} role="status">
      {state.message}
    </p>
  ) : null;
}
