export const PRO_PLAN_TIMEOUT = 'PRO_REQUEST_TIMEOUT';

export function proDeadlineFetch(deadline: AbortSignal, timeout: number): typeof fetch {
  return (input, init) => fetch(input, {
    ...init,
    signal: AbortSignal.any([
      deadline,
      AbortSignal.timeout(timeout),
      ...(input instanceof Request ? [input.signal] : []),
      ...(init?.signal ? [init.signal] : []),
    ]),
  });
}
