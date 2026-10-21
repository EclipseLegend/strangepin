// ONE-OFF MIGRATION (NOT RUN against production). Needs owner approval + a service account.
// Creates/refreshes publicProfiles/{uid} from users/{uid} so the leaderboard, home stats and
// mirrored point awards keep working under the proposed firestore.rules.
//
// Order (docs/firebase-compat-matrix.md): 1) deploy the new client (works with old and new
// rules), 2) run this backfill, 3) deploy the new rules, 4) re-run this backfill once more.
//
// Idempotent: each profile is rebuilt from the CURRENT users/{uid} inside a transaction, so
// re-running converges to the same data (only updatedAt changes) and a concurrent point award
// cannot be overwritten with a stale value.
//
// Dry run (default) prints what would be written. Writing needs BOTH --write and
// --confirm-project=<projectId> matching the project the credentials point at.
//   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/backfill-public-profiles.js
//   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/backfill-public-profiles.js --write --confirm-project=strangepin-4e538
// Test against the emulator first:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-strangepin node scripts/backfill-public-profiles.js --write --confirm-project=demo-strangepin
'use strict';
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const WRITE = process.argv.includes('--write');
const confirmArg = process.argv.find(a => a.startsWith('--confirm-project='));
const CONFIRM = confirmArg ? confirmArg.split('=')[1] : '';

function profileFrom(u) {
  u = u || {};
  const photo = typeof u.photoURL === 'string' && /^https:\/\//.test(u.photoURL) ? u.photoURL : '';
  return {
    displayName: String(u.displayName || '').slice(0, 80),
    photoURL: photo,
    points: Number.isInteger(u.points) ? u.points : 0,
    pins: Number.isInteger(u.pins) ? u.pins : 0,
  };
}

(async () => {
  const project = admin.app().options.projectId || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
  console.log('project: ' + (project || '<unknown>') + (process.env.FIRESTORE_EMULATOR_HOST ? ' (EMULATOR ' + process.env.FIRESTORE_EMULATOR_HOST + ')' : ''));
  if (WRITE && (!CONFIRM || CONFIRM !== project)) {
    console.error('refusing to write: pass --confirm-project=' + (project || '<projectId>') + ' (got "' + CONFIRM + '")');
    process.exit(2);
  }
  const refs = await db.collection('users').listDocuments();
  let n = 0;
  for (const ref of refs) {
    const pubRef = db.collection('publicProfiles').doc(ref.id);
    if (!WRITE) {
      const snap = await ref.get();
      if (!snap.exists) continue;
      console.log('would write publicProfiles/' + ref.id, profileFrom(snap.data()));
      n++;
      continue;
    }
    const wrote = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) return false;
      tx.set(pubRef, { ...profileFrom(snap.data()), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    if (wrote) n++;
  }
  console.log((WRITE ? 'wrote ' : 'dry run: ') + n + ' public profiles');
})().catch(e => { console.error(e); process.exit(1); });
