#!/usr/bin/env node
/**
 * Convenience entry for TV workflow.
 * Default: package for webOS. Pass install|launch|all for more.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const action = process.argv[2] ?? 'help';

function run(script, extraArgs = []) {
  const result = spawnSync(process.execPath, [join(__dirname, script), ...extraArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

switch (action) {
  case 'package':
    run('package-webos.mjs', process.argv.slice(3));
    break;
  case 'install':
    run('install-webos.mjs', process.argv.slice(3));
    break;
  case 'launch':
    run('launch-webos.mjs', process.argv.slice(3));
    break;
  case 'all':
    run('package-webos.mjs');
    run('install-webos.mjs', process.argv.slice(3));
    run('launch-webos.mjs', process.argv.slice(3));
    break;
  default:
    console.log(`
StreamBox TV — LG webOS workflow

  npm run tv:package              Build + package IPK
  npm run tv:install -- --device <name>
  npm run tv:launch  -- --device <name>
  npm run tv -- all --device <name>

Development (simulator-first):

  npm run simulator               Browser + HMR + Fast Refresh
`);
    break;
}
