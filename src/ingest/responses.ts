/**
 * Écriture de retour (§4.2, §4.8, v2.18) : ce qu'un outil a le droit d'écrire
 * dans la source — des données de retour, sous `_responses/`, et rien d'autre.
 *
 * `provider.write()` accepte n'importe quel chemin ; cette fonction est le seul
 * passage que devrait emprunter un consommateur, pour qu'une faute de chemin ne
 * puisse pas écrire dans une série.
 */
import { RESPONSES_DIR, normalizePath } from './paths.js';
import type { ContentProvider, ProviderCallOptions, SnapshotEntry } from './types.js';

/** Chemin refusé : hors de `_responses/`, ou invalide (§4.1). */
export class ResponsePathError extends Error {
  readonly path: string;
  constructor(path: string, reason: string) {
    super(`[hyperfocale] écriture de retour refusée (${reason}) : ${path}`);
    this.name = 'ResponsePathError';
    this.path = path;
  }
}

/** Le provider ne sait pas écrire, ou son accès ne le lui permet pas. */
export class ResponseWriteUnsupportedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`[hyperfocale] écriture de retour impossible : ${message}`, options);
    this.name = 'ResponseWriteUnsupportedError';
  }
}

/**
 * Écrit `bytes` dans la source, sous le dossier de retour. Refuse :
 * - un chemin invalide (§4.1), qui remonte (`..`) ou porte un segment `.` ;
 * - un chemin dont le premier segment n'est pas exactement `_responses` — la
 *   casse compte ici : on écrit sous le nom canonique, même si la lecture
 *   exclut aussi `_Responses` ;
 * - `_responses` seul (il faut un fichier dessous).
 *
 * L'absence de capacité d'écriture ne dégrade que le retour, jamais la
 * publication : l'appelant attrape `ResponseWriteUnsupportedError` et continue.
 */
export async function writeResponse(
  provider: ContentProvider,
  path: string,
  bytes: Uint8Array,
  opts?: ProviderCallOptions,
): Promise<SnapshotEntry> {
  const normalized = normalizePath(path);
  if (!normalized.valid) throw new ResponsePathError(path, normalized.reason ?? 'chemin invalide');
  const segments = normalized.path.split('/');
  if (segments[0] !== RESPONSES_DIR) throw new ResponsePathError(path, `hors de ${RESPONSES_DIR}/`);
  if (segments.length < 2) throw new ResponsePathError(path, 'aucun fichier sous le dossier de retour');
  if (segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) {
    throw new ResponsePathError(path, 'segment relatif ou caché');
  }
  const { localWrite, remoteWrite } = provider.capabilities;
  if (!provider.write || !(localWrite || remoteWrite)) {
    throw new ResponseWriteUnsupportedError(`le provider « ${provider.type} » ne déclare aucune capacité d'écriture`);
  }
  try {
    return await provider.write(normalized.path, bytes, opts);
  } catch (err) {
    // Dropbox : jeton émis sans la portée d'écriture. L'ingestion n'en a pas
    // besoin ; le retour, si.
    if (err instanceof Error && /missing_scope/.test(err.message)) {
      throw new ResponseWriteUnsupportedError(
        'la portée files.content.write manque au jeton Dropbox (à cocher dans la console de l’app, puis réautoriser)',
        { cause: err },
      );
    }
    throw err;
  }
}
