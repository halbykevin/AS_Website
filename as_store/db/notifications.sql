-- ===========================================================================
-- AS Store — notification domain schema (PostgreSQL)
-- Applied by `npm run migrate` after schema.sql. Idempotent: safe to re-run.
--
-- The notification system is a centralized domain in server/src/notifications:
--   events (outbox) -> service handlers -> notifications (inbox rows)
--                                       -> deliveries (per-channel attempts)
-- Times are TIMESTAMPTZ (stored UTC). All personal data lives on customers;
-- these tables reference it rather than copying it.
-- ===========================================================================

-- --- Templates ---------------------------------------------------------------
-- Reusable message shapes. `key` is what code sends by; title/body use
-- {{placeholders}} rendered by the service. Arabic columns fall back to
-- English when empty, so localization can be added copy-by-copy later.
CREATE TABLE IF NOT EXISTS notification_templates (
  id          SERIAL PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,          -- e.g. order_shipped
  name        TEXT NOT NULL,                 -- admin-facing label
  category    TEXT NOT NULL DEFAULT 'order', -- order|promo|news|survey|account
  title_en    TEXT NOT NULL DEFAULT '',
  body_en     TEXT NOT NULL DEFAULT '',
  title_ar    TEXT NOT NULL DEFAULT '',
  body_ar     TEXT NOT NULL DEFAULT '',
  deep_link   TEXT NOT NULL DEFAULT '',      -- default target, may use {{vars}}
  channels    JSONB NOT NULL DEFAULT '["inapp","push"]'::jsonb,
  active      BOOLEAN NOT NULL DEFAULT true,
  version     INTEGER NOT NULL DEFAULT 1,    -- bumped on every edit
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_notification_templates_updated ON notification_templates;
CREATE TRIGGER trg_notification_templates_updated
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Campaigns ---------------------------------------------------------------
-- An admin-authored send (promo / news / survey / announcement). Fanned out to
-- recipient notifications when sent. `audience` is a structured filter, see
-- server/src/notifications/audience.js.
CREATE TABLE IF NOT EXISTS notification_campaigns (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'promo',    -- promo|news|survey|account|order
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  title_ar     TEXT NOT NULL DEFAULT '',
  body_ar      TEXT NOT NULL DEFAULT '',
  image_url    TEXT NOT NULL DEFAULT '',
  deep_link    TEXT NOT NULL DEFAULT '',         -- in-app path or allowlisted URL
  channels     JSONB NOT NULL DEFAULT '["inapp","push"]'::jsonb,
  audience     JSONB NOT NULL DEFAULT '{"type":"all"}'::jsonb,
  priority     TEXT NOT NULL DEFAULT 'normal',   -- normal|high
  status       TEXT NOT NULL DEFAULT 'draft',    -- draft|scheduled|sending|sent|paused|cancelled|failed
  scheduled_at TIMESTAMPTZ,                      -- null + status=scheduled => send now
  sent_at      TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,                      -- inbox rows hidden after this
  survey_id    INTEGER,                          -- optional linked survey
  template_id  INTEGER REFERENCES notification_templates(id) ON DELETE SET NULL,
  created_by   TEXT NOT NULL DEFAULT '',         -- admin email
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON notification_campaigns(status);

DROP TRIGGER IF EXISTS trg_notification_campaigns_updated ON notification_campaigns;
CREATE TRIGGER trg_notification_campaigns_updated
  BEFORE UPDATE ON notification_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Notifications (per-recipient inbox rows) --------------------------------
-- One row per customer per message: this IS the in-app inbox. Content is
-- snapshotted at send time so later template edits don't rewrite history.
-- customer_id may be NULL only for guest-device pushes (no inbox entry shown).
CREATE TABLE IF NOT EXISTS notifications (
  id           SERIAL PRIMARY KEY,
  customer_id  INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  campaign_id  INTEGER REFERENCES notification_campaigns(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL DEFAULT '',
  template_version INTEGER,
  category     TEXT NOT NULL DEFAULT 'order',  -- order|promo|news|survey|account
  title        TEXT NOT NULL DEFAULT '',
  body         TEXT NOT NULL DEFAULT '',
  image_url    TEXT NOT NULL DEFAULT '',
  deep_link    TEXT NOT NULL DEFAULT '',
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- structured metadata (orderId, surveyId, ...)
  priority     TEXT NOT NULL DEFAULT 'normal',
  dedupe_key   TEXT UNIQUE,                    -- idempotency: retries can't duplicate
  read_at      TIMESTAMPTZ,
  clicked_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_customer
  ON notifications(customer_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(customer_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_campaign
  ON notifications(campaign_id);

-- --- Delivery attempts -------------------------------------------------------
-- One row per (notification, channel) fanned out by the worker. Retries with
-- backoff up to a cap, then parks in `dead`. device_token_id is set for push.
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id              SERIAL PRIMARY KEY,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,                  -- inapp|push|email
  device_token_id INTEGER,                        -- push only
  status          TEXT NOT NULL DEFAULT 'queued', -- queued|sent|failed|dead|skipped
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ DEFAULT now(),
  provider_id     TEXT NOT NULL DEFAULT '',       -- provider message/receipt id
  last_error      TEXT NOT NULL DEFAULT '',
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_due
  ON notification_deliveries(next_attempt_at) WHERE status IN ('queued','failed');
CREATE INDEX IF NOT EXISTS idx_deliveries_notification
  ON notification_deliveries(notification_id);

DROP TRIGGER IF EXISTS trg_notification_deliveries_updated ON notification_deliveries;
CREATE TRIGGER trg_notification_deliveries_updated
  BEFORE UPDATE ON notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Device push tokens ------------------------------------------------------
-- Expo push tokens. customer_id NULL = guest device (still gets broadcast
-- promos until it opts out via the app). Sign-out detaches, keeps the device.
CREATE TABLE IF NOT EXISTS device_tokens (
  id          SERIAL PRIMARY KEY,
  token       TEXT UNIQUE NOT NULL,             -- ExponentPushToken[...]
  customer_id INTEGER REFERENCES customers(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL DEFAULT '',          -- ios|android
  provider    TEXT NOT NULL DEFAULT 'expo',
  app_version TEXT NOT NULL DEFAULT '',
  locale      TEXT NOT NULL DEFAULT 'en',
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  revoked_at  TIMESTAMPTZ,                       -- set on provider "not registered" / explicit removal
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_customer ON device_tokens(customer_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_live
  ON device_tokens(customer_id) WHERE revoked_at IS NULL;

DROP TRIGGER IF EXISTS trg_device_tokens_updated ON device_tokens;
CREATE TRIGGER trg_device_tokens_updated
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Preferences -------------------------------------------------------------
-- Per-customer opt-in/out per category + quiet hours. Missing row = defaults
-- (everything on). Transactional categories (order/account) are always
-- delivered and are not part of `categories`.
CREATE TABLE IF NOT EXISTS notification_prefs (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  push_enabled  BOOLEAN NOT NULL DEFAULT true,      -- master push switch (promo/news/survey)
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  categories  JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"promo":true,"news":true,"survey":true}
  quiet       JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"enabled":false,"start":"22:00","end":"08:00","tz":"Asia/Beirut"}
  updated_at  TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_notification_prefs_updated ON notification_prefs;
CREATE TRIGGER trg_notification_prefs_updated
  BEFORE UPDATE ON notification_prefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Event outbox ------------------------------------------------------------
-- Transactional outbox: business code INSERTs an event in the same transaction
-- as the change; the worker turns pending events into notifications. dedupe_key
-- makes emits idempotent (a retried request can't create the event twice).
CREATE TABLE IF NOT EXISTS notification_events (
  id           SERIAL PRIMARY KEY,
  event_type   TEXT NOT NULL,                     -- order_created|order_status_changed|payment_paid|...
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key   TEXT UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending',   -- pending|processed|failed|dead
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT NOT NULL DEFAULT '',
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_events_pending
  ON notification_events(id) WHERE status IN ('pending','failed');

-- --- Surveys -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS surveys (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  intro      TEXT NOT NULL DEFAULT '',
  questions  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id,type:'rating'|'text'|'choice',label,options?}]
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_surveys_updated ON surveys;
CREATE TRIGGER trg_surveys_updated
  BEFORE UPDATE ON surveys
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- One response per customer per survey per order (order optional).
CREATE TABLE IF NOT EXISTS survey_responses (
  id          SERIAL PRIMARY KEY,
  survey_id   INTEGER NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  answers     JSONB NOT NULL DEFAULT '{}'::jsonb, -- {questionId: value}
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_once
  ON survey_responses(survey_id, customer_id, COALESCE(order_id, 0));
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey ON survey_responses(survey_id);

-- --- Audit log ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_audit (
  id         SERIAL PRIMARY KEY,
  actor      TEXT NOT NULL DEFAULT '',            -- admin email or 'system'
  action     TEXT NOT NULL,                       -- campaign_created|campaign_sent|template_updated|...
  entity     TEXT NOT NULL DEFAULT '',            -- campaign|template|survey|notification
  entity_id  INTEGER,
  detail     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_audit_time ON notification_audit(id DESC);

-- --- Default transactional templates ----------------------------------------
-- Seeded once; admins edit them afterwards (edits bump `version`).
INSERT INTO notification_templates (key, name, category, title_en, body_en, deep_link, channels) VALUES
  ('order_received',  'Order received',       'order',
   'Order #{{orderId}} received 🛍️',
   'Thanks {{name}}! We''ve got your {{itemCount}} item(s) ({{total}}). We''ll confirm your order shortly.',
   '/orders/{{orderId}}', '["inapp","push"]'::jsonb),
  ('order_confirmed', 'Order confirmed',      'order',
   'Order #{{orderId}} confirmed ✅',
   'Great news, {{name}} — your order is confirmed and being prepared. We''ll tell you the moment it ships.',
   '/orders/{{orderId}}', '["inapp","push"]'::jsonb),
  ('order_shipped',   'Order shipped',        'order',
   'Your order is on its way 🚚',
   '{{name}}, order #{{orderId}} has left our store and is out for delivery. See you very soon!',
   '/orders/{{orderId}}', '["inapp","push"]'::jsonb),
  ('order_delivered', 'Order delivered',      'order',
   'Delivered! 🎉',
   'Order #{{orderId}} has arrived. Enjoy, {{name}} — and thank you for shopping with AS Store.',
   '/orders/{{orderId}}', '["inapp","push"]'::jsonb),
  ('order_cancelled', 'Order cancelled',      'order',
   'Order #{{orderId}} cancelled',
   'Your order has been cancelled, {{name}}. If this wasn''t expected, get in touch — we''re happy to help.',
   '/orders/{{orderId}}', '["inapp","push"]'::jsonb),
  ('payment_paid',    'Payment received',     'order',
   'Payment received 💳',
   'We''ve received your payment of {{total}} for order #{{orderId}}. You''re all set!',
   '/orders/{{orderId}}', '["inapp","push"]'::jsonb),
  ('payment_failed',  'Payment failed',       'order',
   'Payment didn''t go through',
   'No charge was made for order #{{orderId}}. You can retry the payment from your order page.',
   '/orders/{{orderId}}', '["inapp","push"]'::jsonb),
  ('delivery_feedback', 'Post-delivery feedback', 'survey',
   'How was your order? ⭐',
   'Order #{{orderId}} arrived — tell us how we did in 30 seconds.',
   '/account/survey/{{surveyId}}?order={{orderId}}', '["inapp","push"]'::jsonb),
  ('account_signin',  'New sign-in',          'account',
   'New sign-in to your account',
   'Your account was just signed in on a new device. If this wasn''t you, contact support.',
   '/account', '["inapp"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
