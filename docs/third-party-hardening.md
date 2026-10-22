# EmailJS and Cloudinary: code changes and dashboard settings

Status: code changes implemented and TESTED where stated; **dashboard settings are
recommendations for the owner and have NOT been changed** (no access was used).

## EmailJS (location submission notification)

### Code (pr/technical-v2)

- `to_email` is **no longer sent from the browser** (TESTED: `tests/e2e-emulator.js` checks the
  params). Previously the recipient came from the page, so anyone could call the public EmailJS
  API with the site's public key and choose any recipient: an open relay for spam in
  StrangePin's name.
- New param `submission_id` (the Firestore id, or "(not signed in)").
- Hidden honeypot field `f_website` (off-screen, `aria-hidden`, `tabindex=-1`,
  `autocomplete=off`): if filled, the site shows the success screen and sends nothing.
  NOT TESTED against real bots (EXPECTED to stop naive form-filling bots only).
- Client throttle: one submission per 60 s per browser (localStorage). Bypassable; the
  server-side throttle for signed-in users is in `firestore.rules` (TESTED).
- Length limits (story 5,000, name 150, username 60) before sending.

### Dashboard settings for Effie (EmailJS → account `Ux77…`, service `service_spyyqld`, template `template_6luvilv`)

1. **Template → Settings → "To Email"**: replace `{{to_email}}` (if present) with the fixed
   address `thestrangepin@gmail.com`. **Merge prerequisite**: if the template still uses
   `{{to_email}}`, removing the param from the code makes the notification go nowhere
   (NOT TESTED; the template is not visible from the code).
2. Template body: add `Submission ID: {{submission_id}}`.
3. **Account → Security → "Allowed origins"** (or "Domains"): `https://strangepin.com`
   (and `https://strangepin.netlify.app` only if still used). Blocks use of the public key from
   other sites (browsers only; scripts can fake the Origin header).
4. **Account → Security → Rate limit**: e.g. 1 request per 10 seconds (per IP, if offered).
5. **Account → Security → "Use Private Key"**: keep OFF (the site has no server); never put a
   private key in the page.
6. Optional: enable **reCAPTCHA** in the template settings (would need a site key and a code
   change; not implemented).
7. Watch the monthly quota (EmailJS free tier) in the dashboard.

## Cloudinary (optional photo upload)

### Code (pr/technical-v2)

- Client checks before upload: JPG, PNG or WEBP only, max 10 MB (TESTED in
  `tests/helpers.test.js`; the file picker also restricts types). Friendly error otherwise.
- Only a URL starting with `https://res.cloudinary.com/dz9p5t4sj/image/upload/` (≤ 460 chars) is
  kept; anything else is discarded and the user is told the photo was not uploaded. The same
  prefix is enforced by `firestore.rules` for `submissions.imageUrl` (TESTED).
- If the upload fails, the location is still sent, without the photo, with a notice.

### Dashboard settings for Effie (Cloudinary → Settings → Upload → preset `ao9q18f9`)

The preset is **unsigned**, so anyone who reads the page can upload to the account with it.
Limit what an upload can do:

1. **Signing mode**: Unsigned (required by a static site), but restrict it:
2. **Folder**: `strangepin/submissions` (fixed); **Use filename**: off; **Unique filename**: on;
   **Overwrite**: off.
3. **Allowed formats**: `jpg,jpeg,png,webp`.
4. **Max file size**: 10 MB (10485760 bytes); **Max image width/height**: e.g. 4000 px;
   **Incoming transformation**: `c_limit,w_2000,h_2000,q_auto` (shrinks huge images).
5. **Moderation**: "Manual" (or an add-on such as AWS Rekognition / WebPurify if available on
   the plan) so new uploads are pending until reviewed. The website never shows submission
   photos publicly before the owner publishes the pin, so manual review fits the workflow.
6. **Access mode / Delivery**: keep public delivery (the reviewer needs to open the URL), but
   consider "Strict transformations" ON so only predefined transformations can be generated.
7. **Tags / context**: tag uploads `strangepin-submission` for easy cleanup.
8. **Security → Allowed fetch domains / Restricted media types**: disallow "fetch" and
   "upload from URL" for unsigned uploads if the plan allows.
9. Monitor usage (free credits) and delete rejected submissions' images.

## Residual risks

- Both services are called directly from the browser with public identifiers; abuse is limited
  by the dashboard settings above, not by the code.
- Not-signed-in submissions are notification-only (no Firestore document), so they are throttled
  only on the client and by EmailJS's own limits.
