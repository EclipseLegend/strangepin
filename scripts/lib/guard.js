// Safety guard for the owner's Admin SDK scripts.
//
// The Admin SDK bypasses firestore.rules, so these scripts refuse to start unless they are
// clearly pointed at a target:
//   * the local emulator: FIRESTORE_EMULATOR_HOST is set and the project id starts with "demo-"
//     (GCLOUD_PROJECT, default demo-strangepin), or
//   * production, only with BOTH --project=strangepin-4e538 AND --confirm on the command line,
//     plus GOOGLE_APPLICATION_CREDENTIALS pointing at a service account key kept outside the repo.
// Even then the scripts only READ unless --write is also given (dry run by default).
'use strict';

const PROD_PROJECT = 'strangepin-4e538';

function parseArgs(argv) {
  const flags = {}; const positional = [];
  for (const a of argv) {
    if (a.startsWith('--')) {
      const i = a.indexOf('=');
      if (i === -1) flags[a.slice(2)] = true; else flags[a.slice(2, i)] = a.slice(i + 1);
    } else positional.push(a);
  }
  return { flags, positional };
}

/** Returns { projectId, emulator, write } or throws an Error explaining why it refuses. */
function resolveTarget(flags, env) {
  env = env || process.env;
  const write = flags.write === true;
  if (env.FIRESTORE_EMULATOR_HOST) {
    const projectId = env.GCLOUD_PROJECT || 'demo-strangepin';
    if (!projectId.startsWith('demo-')) throw new Error('refusing: with FIRESTORE_EMULATOR_HOST the project id must start with "demo-" (got "' + projectId + '")');
    if (flags.project && flags.project !== projectId) throw new Error('refusing: --project does not match the emulator project');
    return { projectId, emulator: true, write };
  }
  if (flags.project !== PROD_PROJECT || flags.confirm !== true) {
    throw new Error('refusing: FIRESTORE_EMULATOR_HOST is not set. To run against production you must pass --project=' +
      PROD_PROJECT + ' --confirm (and only after the owner has approved that run).');
  }
  if (!env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('refusing: GOOGLE_APPLICATION_CREDENTIALS (service account key file) is not set');
  return { projectId: PROD_PROJECT, emulator: false, write };
}

function initAdmin(target) {
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp({ projectId: target.projectId });
  return admin;
}

function banner(target, what) {
  const where = target.emulator ? 'EMULATOR ' + process.env.FIRESTORE_EMULATOR_HOST + ' / ' + target.projectId : 'PRODUCTION ' + target.projectId;
  console.log('[' + what + '] target: ' + where + ' | mode: ' + (target.write ? 'WRITE' : 'DRY RUN (no writes)'));
}

module.exports = { PROD_PROJECT, parseArgs, resolveTarget, initAdmin, banner };
