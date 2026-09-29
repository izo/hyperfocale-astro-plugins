/**
 * `Promise.all` borné : au plus `limit` appels de `fn` en vol, résultats dans
 * l'ordre des entrées. Le premier rejet interrompt la distribution de nouveaux
 * appels et se propage.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Attente interrompue dès que `signal` est levé, avec son motif. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject((signal as AbortSignal).reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
