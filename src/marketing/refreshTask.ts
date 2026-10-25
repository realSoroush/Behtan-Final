/** Coalesce bursts, but never lose an invalidation arriving during a request. */
export function createRefreshTask(
  work: () => Promise<void>,
  active: () => boolean = () => true,
) {
  let running = false,
    queued = false;
  return async function refresh(): Promise<void> {
    if (!active()) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      do {
        queued = false;
        await work();
      } while (queued && active());
    } finally {
      running = false;
    }
  };
}
