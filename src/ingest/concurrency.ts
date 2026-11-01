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

/** Bornes de `mapConcurrentWeighted`. */
export interface WeightedConcurrencyOptions<T> {
  /** Appels de `fn` simultanés au plus. */
  readonly limit: number;
  /** Poids cumulé maximal des appels en vol — des octets, ici. */
  readonly maxWeight: number;
  /** Poids d'un élément (>= 0). Un élément sans poids connu pèse 0. */
  readonly weight: (item: T, index: number) => number;
}

/**
 * Comme `mapConcurrent`, avec en plus un **budget de poids** (PERF-008) : on ne
 * lance l'élément suivant que si le poids des appels en vol, le sien compris,
 * tient dans `maxWeight`. Un élément plus lourd que le budget passe quand même,
 * mais **seul** : rien ne bloque jamais. L'ordre de départ est celui des entrées
 * (pas de dépassement d'un gros par des petits) et les résultats suivent l'ordre
 * des entrées. Le premier rejet interrompt la distribution de nouveaux appels et
 * se propage ; les appels déjà en vol vont à leur terme, leurs erreurs sont
 * absorbées.
 */
export function mapConcurrentWeighted<T, R>(
  items: readonly T[],
  options: WeightedConcurrencyOptions<T>,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const { limit, maxWeight, weight } = options;
  const results = new Array<R>(items.length);
  if (items.length === 0) return Promise.resolve(results);
  return new Promise<R[]>((resolve, reject) => {
    let next = 0;
    let active = 0;
    let inFlight = 0;
    let failed = false;
    const pump = (): void => {
      while (!failed && next < items.length && active < limit) {
        const index = next;
        const w = Math.max(0, weight(items[index] as T, index));
        if (active > 0 && inFlight + w > maxWeight) break;
        next++;
        active++;
        inFlight += w;
        fn(items[index] as T, index).then(
          (value) => {
            results[index] = value;
          },
          (error: unknown) => {
            if (!failed) {
              failed = true;
              reject(error);
            }
          },
        ).finally(() => {
          active--;
          inFlight -= w;
          if (failed) return;
          if (next >= items.length && active === 0) resolve(results);
          else pump();
        });
      }
    };
    pump();
  });
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
