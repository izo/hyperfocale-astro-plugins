/** Entrées-sorties d'une commande : injectables pour les tests. */
export interface CliIO {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Dossier courant, pour résoudre les chemins relatifs. */
  readonly cwd: string;
}

/** Codes de sortie du CLI. */
export const EXIT = {
  ok: 0,
  /** Au moins un diagnostic `error`. */
  diagnostics: 1,
  /** Mauvais usage : commande, option ou argument invalide. */
  usage: 2,
} as const;
