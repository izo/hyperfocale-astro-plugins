/**
 * hyperfocale init
 *
 * Crée ou met à jour src/content.config.ts dans le projet consommateur
 * pour enregistrer la collection `series`.
 *
 * Le fichier d'un tiers n'est jamais réécrit au hasard (#153) : la fusion ne
 * touche que le cas trivial — un objet `collections` sans imbrication — après
 * une sauvegarde `content.config.ts.bak`. Tout autre cas est laissé intact et
 * les lignes à ajouter sont affichées.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { CliIO } from './io.js';

const VIRTUAL_IMPORT = `import { seriesCollection } from 'virtual:hyperfocale/collection';`;
const COLLECTION_EXPORT = `series: seriesCollection`;

const TEMPLATE = `${VIRTUAL_IMPORT}

export const collections = {
  series: seriesCollection,
};
`;

/**
 * Le source où commentaires et contenu des chaînes sont remplacés par des
 * espaces (retours à la ligne conservés) : même longueur, mêmes positions, mais
 * seul le code reste visible aux expressions régulières.
 */
export function maskNonCode(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      let end = source.indexOf('\n', i);
      if (end === -1) end = source.length;
      blank(i, end);
      i = end;
    } else if (c === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(i, end);
      i = end;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === '\\') j++;
        else if (c !== '`' && source[j] === '\n') break;
        j++;
      }
      // Les guillemets restent, le contenu part.
      blank(i + 1, Math.min(j, source.length));
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join('');
}

/** Chemin libre pour la sauvegarde : `.bak`, puis `.bak.1`, `.bak.2`… */
function backupPath(configPath: string): string {
  let candidate = `${configPath}.bak`;
  for (let n = 1; existsSync(candidate); n++) candidate = `${configPath}.bak.${n}`;
  return candidate;
}

/** Exécute `init` dans `io.cwd` ; rend le code de sortie. */
export function runInit(io: CliIO): number {
  const log = (msg: string) => io.stdout(`[hyperfocale] ${msg}\n`);
  const configPath = resolve(io.cwd, 'src/content.config.ts');

  const manual = (reason: string, needImport: boolean): number => {
    log(`⚠ src/content.config.ts n'a pas été modifié : ${reason}`);
    log(`  À ajouter à la main :`);
    if (needImport) log(`    ${VIRTUAL_IMPORT}`);
    log(`    export const collections = {`);
    log(`      /* … vos collections … */`);
    log(`      ${COLLECTION_EXPORT},`);
    log(`    };`);
    return 0;
  };

  try {
    if (!existsSync(configPath)) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, TEMPLATE, 'utf-8');
      log(`✓ Créé : src/content.config.ts`);
      log(`  La collection "series" est prête.`);
      return 0;
    }

    const existing = readFileSync(configPath, 'utf-8');
    const code = maskNonCode(existing);

    // Idempotence : la clé, au espacement près, hors commentaire et hors chaîne.
    if (/\bseries\s*:\s*seriesCollection\b/.test(code)) {
      log(`ℹ src/content.config.ts existe déjà et contient la collection "series".`);
      log(`  Aucune modification nécessaire.`);
      return 0;
    }

    const importMatch = /import\s*\{[^}]*\bseriesCollection\b[^}]*\}\s*from\s*['"]virtual:hyperfocale\/collection['"]\s*;?/.exec(existing);
    const hasImport = importMatch !== null && code.startsWith('import', importMatch.index);
    const importLine = hasImport ? '' : `${VIRTUAL_IMPORT}\n`;

    const exportMatch = /export\s+const\s+collections\s*=\s*\{/.exec(code);

    if (!exportMatch) {
      // Un `collections` déclaré autrement (`export { collections }`, `export default`…) :
      // y ajouter un second export casserait le fichier.
      if (/\bcollections\b/.test(code)) {
        return manual("`collections` est déclaré d'une autre façon que `export const collections = { … }`.", !hasImport);
      }
      const updated = `${importLine}${existing}\nexport const collections = {\n  ${COLLECTION_EXPORT},\n};\n`;
      copyFileSync(configPath, backupPath(configPath));
      writeFileSync(configPath, updated, 'utf-8');
      log(`✓ Mis à jour : src/content.config.ts (sauvegarde : content.config.ts.bak)`);
      log(`  Export collections ajouté.`);
      return 0;
    }

    // Accolade fermante de l'objet : on lit le code masqué, donc ni chaîne ni
    // commentaire ne comptent. Un objet imbriqué, un appel ou un tableau dans
    // `collections` : on ne fusionne pas.
    const open = exportMatch.index + exportMatch[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let k = open; k < code.length; k++) {
      const ch = code[k];
      if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        close = k;
        break;
      }
    }
    if (close === -1) return manual('les accolades de `collections` ne sont pas équilibrées.', !hasImport);

    const body = code.slice(open + 1, close);
    if (/[{}()[\]]/.test(body)) {
      return manual('`collections` contient des définitions imbriquées (`defineCollection(...)`, objets, tableaux).', !hasImport);
    }

    // Insertion après la dernière entrée, virgule comprise, avant tout commentaire final.
    const lastCode = body.search(/\S\s*$/);
    let updated: string;
    if (lastCode === -1) {
      const rest = existing.slice(open + 1);
      updated = `${existing.slice(0, open + 1)}\n  ${COLLECTION_EXPORT},${rest.startsWith('\n') ? '' : '\n'}${rest}`;
    } else {
      const at = open + 1 + lastCode + 1;
      const comma = code[at - 1] === ',' ? '' : ',';
      updated = `${existing.slice(0, at)}${comma}\n  ${COLLECTION_EXPORT},${existing.slice(at)}`;
    }
    updated = importLine + updated;

    copyFileSync(configPath, backupPath(configPath));
    writeFileSync(configPath, updated, 'utf-8');
    log(`✓ Mis à jour : src/content.config.ts (sauvegarde : content.config.ts.bak)`);
    log(`  Collection "series" ajoutée à l'export existant.`);
    return 0;
  } catch (err) {
    io.stderr(`[hyperfocale] ✗ Échec de l'initialisation : ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
