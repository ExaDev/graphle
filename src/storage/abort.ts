/**
 * Error shape used when an operation is cancelled via its AbortSignal. Named
 * "AbortError" to mirror the DOM convention (an AbortController abort rejects
 * with an AbortError DOMException), but implemented as a plain Error subclass
 * so it works under the Node vitest environment as well as the browser.
 */
export class AbortError extends Error {
  readonly name = "AbortError";

  constructor(message = "The operation was aborted.") {
    super(message);
  }
}

/**
 * Run an async operation so it rejects with AbortError the moment the signal
 * aborts. Dexie has no native AbortSignal integration, so the store races the
 * operation against the signal: a pre-flight abort rejects immediately, and a
 * mid-flight abort rejects as soon as the signal fires. The listener is
 * removed once the operation settles so the signal is not pinned in memory.
 * For writes the abort is best-effort: the underlying IndexedDB transaction
 * may still commit after the caller has rejected.
 */
export function withAbort<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new AbortError());

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new AbortError());
    };
    signal.addEventListener("abort", onAbort, { once: true });

    operation().then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
