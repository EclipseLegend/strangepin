# Account deletion requests (owner procedure)

Status: request flow implemented and TESTED on the emulator. **Nothing is deleted
automatically** and no deletion tooling is included: the owner processes requests by hand.

## How users ask

- **Profile → Privacy & account → "Request account deletion"** (signed in). After a
  confirmation dialog the website creates `deletionRequests/{uid}`:
  `{ uid, status: 'requested', requestedAt: <server time>, reason: '' }`.
  Only that user can create or read their own request; nobody can change or delete it from the
  browser (TESTED). The profile then shows "Your deletion request was received…".
- **E-mail**: the same section links to `thestrangepin@gmail.com` (subject "Account deletion
  request") for people who cannot sign in.

The page promises: handled by hand, usually within 30 days, confirmed by e-mail.

## Finding requests

Firebase console → Firestore → `deletionRequests` (Spark plan; no tooling needed), plus the
mailbox.

## Processing a request (manual, in the Firebase console)

1. Verify the requester: the `deletionRequests/{uid}` document proves the signed-in owner of that
   uid asked. For e-mail requests, reply from the StrangePin mailbox to the address stored in
   `users/{uid}.email` and wait for confirmation.
2. Delete, for that uid:
   - `users/{uid}` and its `saved` sub-collection;
   - `publicProfiles/{uid}`;
   - their `submissions` (filter `authorUid == uid`) and the matching `pointAwards/{submissionId}`;
   - their comments (each `pins/{pinId}/comments` where `uid == uid`), their reactions
     (`pins/{pinId}/reactions/{uid}`) and like markers (`…/likes/{uid}`); likes counters on other
     people's comments may be left as they are;
   - the Firebase Authentication user (console → Authentication → Users → delete).
   Images the user uploaded are in Cloudinary (`dz9p5t4sj`): delete them in the Cloudinary
   Media Library (the URL is in the submission's `imageUrl`).
3. Update the request: set `status` to `done` and add `processedAt` (console edit; the browser
   cannot change it). Optionally delete the request document after confirming by e-mail.
4. Reply to the user.

Spark: all of this is console work within the free quota; no Cloud Functions needed.

## Not implemented (by design, for now)

- Automatic deletion (would need Cloud Functions → Blaze, or a privileged script; out of scope).
- Data export for the user (can be done by hand from the console if asked).
