import { unstable_isUnrecognizedActionError } from "next/navigation";

/**
 * True when a server action failed because this screen is from an older
 * release (a new version went live while it was open).
 */
export function isOutdatedApp(error: unknown) {
  if (unstable_isUnrecognizedActionError(error)) return true;
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /UnrecognizedActionError|Server Action .* was not found|Failed to find Server Action|older or newer deployment/i.test(text);
}

/** Reloads to the newest version (at most once a minute, so it can never loop). Returns false if it did not reload. */
export function reloadForUpdate() {
  try {
    const last = Number(window.sessionStorage.getItem("gpbm-update-reload") ?? 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem("gpbm-update-reload", String(Date.now()));
  } catch { /* storage blocked: reload anyway */ }
  window.location.reload();
  return true;
}

/** For `.catch`: reloads when the screen is out of date; otherwise returns the fallback result. */
export function updateOr<T>(fallback: T) {
  return (error: unknown): T => {
    if (isOutdatedApp(error)) reloadForUpdate();
    return fallback;
  };
}
