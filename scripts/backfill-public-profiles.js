// ONE-OFF MIGRATION (NOT RUN). Needs owner approval + a service account.
// Creates publicProfiles/{uid} for existing users/{uid} docs so the leaderboard,
// home stats and mirrored point awards keep working under the proposed
// firestore.rules. Run it BEFORE deploying the new rules and the new app code.
//
// Dry run (default) prints what would be written; pass --write to apply.
//   GOOGLE_APPLICATION_CREDENTIALS=sa.json node scripts/backfill-public-profiles.js [--write]
// Test it first against the emulator:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-strangepin node scripts/backfill-public-profiles.js --write
'use strict';
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();
const WRITE = process.argv.includes('--write');

(async () => {
  const users = await db.collection('users').get();
  let n = 0;
  for (const d of users.docs) {
    const u = d.data() || {};
    const photo = typeof u.photoURL === 'string' && /^https:\/\//.test(u.photoURL) ? u.photoURL : '';
    const pub = {
      displayName: String(u.displayName || '').slice(0, 80),
      photoURL: photo,
      points: Number.isInteger(u.points) ? u.points : 0,
      pins: Number.isInteger(u.pins) ? u.pins : 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    n++;
    if (WRITE) await db.collection('publicProfiles').doc(d.id).set(pub, { merge: true });
    else console.log('would write publicProfiles/' + d.id, { ...pub, updatedAt: '<server time>' });
  }
  console.log((WRITE ? 'wrote ' : 'dry run: ') + n + ' public profiles');
})().catch(e => { console.error(e); process.exit(1); });
