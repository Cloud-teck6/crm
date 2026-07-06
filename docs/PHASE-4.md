# Phase 4 — Communication hub (changelog)

Work every lead across email, WhatsApp, SMS and phone from one screen, on a
single threaded timeline, with every vendor behind a swappable adapter.

## What shipped

**Unified messaging (`modules/messaging`)**
- **Send** (`POST /api/messages`) across EMAIL / WHATSAPP / SMS via a channel
  adapter; resolves the recipient from the linked contact/lead, threads by
  `channel:record`, records an outbound `Message` and drives its status
  (QUEUED → SENT/FAILED) from the adapter result.
- **WhatsApp 24-hour window** — free-form replies are allowed only within 24h of
  the customer's last inbound WhatsApp; otherwise an **approved template** is
  required. Templates outside the window send proactively.
- **Templates** (`/api/templates`) — email/WhatsApp/SMS templates with
  `{{merge}}` variables (auto-extracted), approval status (WhatsApp needs
  APPROVED), and merge rendering from the contact + caller-supplied vars.
- **Inbound webhooks** (public): `POST /api/webhooks/{whatsapp|sms|email}/:id`
  parse the provider payload (WhatsApp Cloud API shape or normalized keys),
  match/create the contact-or-lead, record an inbound `Message`, notify the
  owner, and **open the 24h window**. WhatsApp GET challenge handshake included.
- **Unified timeline** (`GET /api/timeline/:recordType/:recordId`) merges
  Messages + Calls + Activities into one chronological feed.

**Calls (`modules/messaging/calls`)**
- **Click-to-call** (`POST /api/calls/click-to-call`) via the voice adapter →
  `Call` record; **manual call logging** with disposition/notes;
  `POST /api/webhooks/voice/status` updates duration / recording URL /
  disposition from the provider callback.

**Adapters (`integrations/adapters/channel`, `/voice`)**
- Default **sandbox ("log") adapters** for all channels + telephony so the hub
  works with zero external credentials (records + synthetic provider ids).
- A real **WhatsApp Business Cloud API** adapter (text + template sends),
  selected via `WHATSAPP_PROVIDER=cloud_api` + token. SES/SendGrid (email),
  MSG91/Twilio (SMS) and Twilio/Exotel (voice) slot in behind the same
  interfaces + factory.

**Schema** — added `MessageTemplate` (+ `TemplateStatus`). `Message`/`Call`
already existed from Phase 1.

**Frontend** — a **Conversations** page: contact picker → unified timeline
(chat bubbles for messages, inline call/activity rows with recording links) →
composer (channel + template selector, subject/body) → click-to-call.

## Tests

- **Unit (28 total, +2):** template variable extraction + merge rendering.
- **e2e (25 total, +6, live Postgres):** send email + timeline; template render;
  **WhatsApp 24h window** (free-form blocked with no inbound; approved template
  allowed proactively); **inbound WhatsApp** (Cloud API shape) → contact match →
  free-form reply now allowed; **click-to-call + status callback** (duration +
  recording); permission gating (`message:create` denied → 403).

## Assumptions & limitations (isolated for later)

- Real provider sends are sandboxed by default (no creds in this env); the
  WhatsApp Cloud API adapter is the one real implementation, env-gated.
- Inbound WhatsApp signature (X-Hub-Signature-256) verification is **not yet
  enforced** on the messaging webhook — add it (as in the Meta lead adapter)
  before production. Public-endpoint rate limiting is Phase 8.
- Timeline read is tenant-isolated + `message:view`-gated but does not yet apply
  per-record data-scope; tighten in Phase 8 hardening.
- Email/SMS inbound parsing maps common provider keys; provider-specific quirks
  (SendGrid multipart, MSG91/Twilio formats) map into the same normalized shape.

## Next: Phase 5 — Automation & scoring

Assignment/routing engine (round-robin/load-balanced/territory/rule-based),
lead scoring (rule-based + optional AI), and a no-code workflow builder
(trigger → conditions → actions, incl. send-template/start-sequence).
