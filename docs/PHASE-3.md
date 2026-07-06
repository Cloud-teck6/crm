# Phase 3 — Lead ingestion (changelog)

The differentiator: capture leads from any source in real time, validate, dedup,
route to an owner, and notify — all behind a pluggable adapter so providers swap
without touching the pipeline.

## What shipped

**Ingestion pipeline (`modules/ingestion`)** — one path every source flows through:
1. **Validation gate** — rejects placeholder/malformed emails and invalid /
   sequential / repeated phones before any record is created.
2. **Dedup** — matches existing leads (and links matching contacts) by email or
   phone within the tenant; on a hit it appends a **touchpoint** instead of
   creating a duplicate.
3. **Owner routing** — connection default owner, else least-loaded active user.
4. **Notification** — an in-app `Notification` for the assigned owner.
5. **Webhook event log** — every delivery is logged (verification + processing
   status, source IP, raw payload), **idempotent** on `(provider, providerEventId)`,
   with retry counting → **dead-letter** after 5 failures and admin **replay**.

**Lead source adapters (`integrations/adapters`)** — implement the common
`LeadSourceAdapter` interface:
- **Generic Inbound API** — `POST /api/ingest/:id`, authenticated by a per-
  connection API key (`X-Api-Key`, argon2-hashed). Catch-all for IndiaMART/
  JustDial/Zapier/etc. with field-alias mapping.
- **Website form** — `POST /api/forms/:id`, honeypot spam check (+ reCAPTCHA
  stub).
- **Meta Lead Ads** — `GET /api/webhooks/meta/:id` challenge handshake;
  `POST` verified by **X-Hub-Signature-256 HMAC** over the raw body; fetches the
  full field set from the **Graph API** with the stored Page Access Token
  (inline `field_data` supported for replay/test); alias-mapped, custom answers
  preserved.
- **Google Ads** — `POST /api/webhooks/google/:id`, shared-key check,
  `user_column_data` mapping + gclid capture.

**Connection management (`modules/integrations`)** — CRUD for `IntegrationConnection`,
API-key generation/regeneration (shown once), secret masking, inbound-URL
exposure, per-connection event stats (today/7d/30d/total/dead-letter), and replay.

**Frontend** — Integrations page: create connections (provider-specific config),
one-time API-key reveal, inbound URLs, and a webhook-events modal with stats +
dead-letter replay.

## Tests

- **Unit (26 total, +6):** validation gate; Meta adapter challenge, HMAC
  signature (incl. tampered-body rejection), and field-alias normalization.
- **e2e (19 total, +6, live Postgres):** generic ingest (valid key → created +
  attributed + owner-assigned; bad key → 401); spam rejection; dedup +
  touchpoint; **idempotent** redelivery; website honeypot; **Meta challenge +
  signed leadgen event** (bad signature → 401).

## Assumptions & limitations (isolated for later phases)

- **Processing is synchronous** (well under the 30s speed-to-lead target).
  BullMQ + Redis wiring for scale/retry-at-scale is structured but not enabled
  (no Redis in this env) — the `WebhookEvent` retry/dead-letter state machine is
  already in place.
- **Website form endpoint is public** (honeypot-only by design for embedding);
  reCAPTCHA verification is a config-gated stub. **Rate limiting** on public
  endpoints lands in Phase 8 hardening.
- Graph API fetch uses the documented lead endpoint shape behind the adapter; the
  e2e exercises the inline-`field_data` path (no live Graph call).
- Meta retains leads ~90 days — a backfill job on (re)connect is a Phase 3.x
  follow-up (the adapter + ingestion pipeline it would feed are done).

## Next: Phase 4 — Communication hub

Email (out+in) → WhatsApp Business API (templates + 24h window) → SMS →
click-to-call + recording, all on the unified `Message`/`Call` timeline, behind
the `ChannelAdapter`/`VoiceAdapter` interfaces already defined.
