#!/usr/bin/env node
/**
 * Bin `hyperfocale`.
 *
 * Usage : npx hyperfocale [init | validate | snapshot | diff] — `init` par
 * défaut, comme avant l'arrivée des commandes d'ingestion. Voir `main.ts`.
 */

import { main } from './main.js';

main(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`[hyperfocale] ✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  },
);
