import { runInit } from './init-config.js';
import { EXIT, type CliIO } from './io.js';

export const USAGE = `Usage : hyperfocale [commande]

  init                                 Enregistre la collection "series" dans src/content.config.ts
                                       (commande par défaut)
  validate <dossier> [options]         Valide un corpus (contrat d'ingestion, spec §4.10)
      --root <chemin>[:nodate]         Racine de validation, répétable (défaut : tout le corpus)
      --ignore <règle>                 Exclusion supplémentaire, répétable (« _todo/ »)
      --json                           Sortie JSON
  snapshot <dossier> [options]         Calcule le ContentSnapshot d'un dossier (spec §4.5)
      -o, --output <fichier>           Écrit le snapshot dans un fichier (défaut : sortie standard)
      --ignore <règle>                 Exclusion supplémentaire, répétable
      --json                           Résumé JSON quand -o est donné
  diff <base.json> <target.json>       Compare deux snapshots (spec §4.7)
      --json                           Sortie JSON (le ContentChangeSet)

Codes de sortie : 0 ok · 1 diagnostic de sévérité error · 2 mauvais usage
`;

const INGEST_COMMANDS = new Set(['validate', 'snapshot', 'diff']);

/**
 * Point d'entrée du CLI. Sans commande, `init` — le comportement historique du
 * bin. Les commandes d'ingestion sont chargées à la demande : `init` ne tire
 * ni js-yaml, ni le reste du module.
 */
export async function main(argv: readonly string[], io: CliIO): Promise<number> {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'init') return runInit(io);
  if (command === '-h' || command === '--help' || command === 'help') {
    io.stdout(USAGE);
    return EXIT.ok;
  }
  if (INGEST_COMMANDS.has(command)) {
    const { runIngestCommand } = await import('./ingest.js');
    return runIngestCommand(command as 'validate' | 'snapshot' | 'diff', rest, io);
  }
  io.stderr(`[hyperfocale] ✗ Commande inconnue : ${command}\n\n${USAGE}`);
  return EXIT.usage;
}
