/**
 * hyperfocale init
 *
 * Crée ou met à jour src/content.config.ts dans le projet consommateur
 * pour enregistrer la collection `series`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { CliIO } from './io.js';

const VIRTUAL_IMPORT = `import { seriesCollection } from 'virtual:hyperfocale/collection';`;
const COLLECTION_EXPORT = `series: seriesCollection`;

const TEMPLATE = `${VIRTUAL_IMPORT}

export const collections = {
  series: seriesCollection,
};
`;

/** Exécute `init` dans `io.cwd` ; rend le code de sortie. */
export function runInit(io: CliIO): number {
  const log = (msg: string) => io.stdout(`[hyperfocale] ${msg}\n`);
  const configPath = resolve(io.cwd, 'src/content.config.ts');

  try {
    if (!existsSync(configPath)) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, TEMPLATE, 'utf-8');
      log(`✓ Créé : src/content.config.ts`);
      log(`  La collection "series" est prête.`);
      return 0;
    }

    const existing = readFileSync(configPath, 'utf-8');

    if (existing.includes(COLLECTION_EXPORT)) {
      log(`ℹ src/content.config.ts existe déjà et contient la collection "series".`);
      log(`  Aucune modification nécessaire.`);
      return 0;
    }

    let updated = existing;
    if (!existing.includes(VIRTUAL_IMPORT)) {
      updated = `${VIRTUAL_IMPORT}\n${updated}`;
    }

    const exportMatch = updated.match(/export\s+const\s+collections\s*=\s*\{([^}]*)\}/s);
    if (exportMatch?.[1] !== undefined) {
      const inner = exportMatch[1].trimEnd();
      const separator = inner.trim() === '' ? '' : ',\n  ';
      updated = updated.replace(
        exportMatch[0],
        `export const collections = {${inner}${separator}  ${COLLECTION_EXPORT},\n}`,
      );
      writeFileSync(configPath, updated, 'utf-8');
      log(`✓ Mis à jour : src/content.config.ts`);
      log(`  Collection "series" ajoutée à l'export existant.`);
      return 0;
    }

    updated += `\nexport const collections = {\n  ${COLLECTION_EXPORT},\n};\n`;
    writeFileSync(configPath, updated, 'utf-8');
    log(`✓ Mis à jour : src/content.config.ts`);
    log(`  Export collections ajouté.`);
    return 0;
  } catch (err) {
    io.stderr(`[hyperfocale] ✗ Échec de l'initialisation : ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
