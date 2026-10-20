// Request IDs only: never patient details or access tokens. Survive a reload
// after a lost response so an explicit retry cannot create a second record.
export function requestKey(
  scope: string,
  storage?: Pick<Storage, "getItem" | "setItem">,
): string {
  const key = `behtan.pro.request.${scope}`;
  try {
    const existing = storage?.getItem(key);
    if (
      existing &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        existing,
      )
    )
      return existing;
  } catch {
    /* Storage can be disabled; keep the in-memory key for this session. */
  }
  const value = crypto.randomUUID();
  try {
    storage?.setItem(key, value);
  } catch {
    /* No clinical data are persisted. */
  }
  return value;
}
export function clearRequestKey(
  scope: string,
  storage?: Pick<Storage, "removeItem">,
): void {
  try {
    storage?.removeItem(`behtan.pro.request.${scope}`);
  } catch {
    /* In-memory key is cleared by caller. */
  }
}
