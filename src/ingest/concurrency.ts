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

/**
 * Mémorise une lecture par chemin (PERF-009). `validateSnapshot` et
 * `guardChangeSet` lisent les mêmes fichiers index : leur passer la même lecture
 * mémorisée évite de lire chaque fichier deux fois. Les lectures simultanées d'un
 * même chemin partagent leur promesse ; un échec n'est pas retenu, la lecture
 * suivante réessaie.
 *
 * À réserver aux fichiers texte que l'on relit — le cache garde le contenu : ne pas
 * lui faire lire des médias.
 */
export function memoizeRead<T>(read: (path: string) => Promise<T>): (path: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>();
  return (path) => {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;
    const pending = read(path).catch((error: unknown) => {
      cache.delete(path);
      throw error;
    });
    cache.set(path, pending);
    return pending;
  };
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
