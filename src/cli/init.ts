#!/usr/bin/env node
/**
 * hyperfocale init
 *
 * Crée ou met à jour src/content.config.ts dans le projet consommateur
 * pour enregistrer la collection `series`.
 *
 * Usage : npx hyperfocale init
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const VIRTUAL_IMPORT = `import { seriesCollection } from 'virtual:hyperfocale/collection';`;
const COLLECTION_EXPORT = `series: seriesCollection`;
const CONFIG_PATH = resolve(process.cwd(), 'src/content.config.ts');

const TEMPLATE = `${VIRTUAL_IMPORT}

export const collections = {
  series: seriesCollection,
};
`;

function log(msg: string) {
  process.stdout.write(`[hyperfocale] ${msg}\n`);
}

function error(msg: string) {
  process.stderr.write(`[hyperfocale] ✗ ${msg}\n`);
  process.exit(1);
}

function init() {
  if (!existsSync(CONFIG_PATH)) {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, TEMPLATE, 'utf-8');
    log(`✓ Créé : src/content.config.ts`);
    log(`  La collection "series" est prête.`);
    return;
  }

  const existing = readFileSync(CONFIG_PATH, 'utf-8');

  if (existing.includes(COLLECTION_EXPORT)) {
    log(`ℹ src/content.config.ts existe déjà et contient la collection "series".`);
    log(`  Aucune modification nécessaire.`);
    return;
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
    writeFileSync(CONFIG_PATH, updated, 'utf-8');
    log(`✓ Mis à jour : src/content.config.ts`);
    log(`  Collection "series" ajoutée à l'export existant.`);
    return;
  }

  updated += `\nexport const collections = {\n  ${COLLECTION_EXPORT},\n};\n`;
  writeFileSync(CONFIG_PATH, updated, 'utf-8');
  log(`✓ Mis à jour : src/content.config.ts`);
  log(`  Export collections ajouté.`);
}

try {
  init();
} catch (err) {
  error(`Échec de l'initialisation : ${err instanceof Error ? err.message : String(err)}`);
}
