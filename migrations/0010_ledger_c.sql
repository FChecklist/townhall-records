-- AOA-RWA D1 schema 0010: ledger C, this product's own payment ledger, tied to ledger B (IT SERVICES BY RAJAT AGARWAL, central) and ledger A (Razorpay) by the same ids.
-- txn_id = <SITE CODE>-<our payment id> (made by the central service), rzp_order_id order_..., rzp_payment_id pay_... (one per ATTEMPT), rzp_refund_id rfnd_...
-- No card data, no payer e-mail or mobile in full: only the masked form (the full values live in ledger B and at Razorpay).
ALTER TABLE payments ADD COLUMN txn_id TEXT;

CREATE TABLE payment_attempt (          -- one row per Razorpay attempt; a failed attempt can be followed by a paid one for the same payment
  rzp_payment_id TEXT PRIMARY KEY, rzp_order_id TEXT, payment_id TEXT NOT NULL, event_id TEXT NOT NULL, txn_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('created','authorized','paid','failed','refunded')), amount_minor INTEGER NOT NULL, currency TEXT NOT NULL,
  method TEXT, bank TEXT, card_network TEXT, card_type TEXT, card_last4 TEXT, vpa_masked TEXT, rrn TEXT,
  error_code TEXT, error_description TEXT, error_reason TEXT, fee_minor INTEGER, tax_minor INTEGER, is_international INTEGER,
  payer_email_masked TEXT, payer_phone_masked TEXT, created_ms INTEGER NOT NULL, authorized_ms INTEGER, paid_ms INTEGER, failed_ms INTEGER, updated_ms INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX payment_attempt_pay ON payment_attempt(payment_id);
CREATE INDEX payment_attempt_time ON payment_attempt(paid_ms);

CREATE TABLE payment_refund (
  rzp_refund_id TEXT PRIMARY KEY, rzp_payment_id TEXT NOT NULL, payment_id TEXT, event_id TEXT, amount_minor INTEGER NOT NULL, currency TEXT, status TEXT NOT NULL,
  created_ms INTEGER NOT NULL, processed_ms INTEGER, updated_ms INTEGER NOT NULL
) WITHOUT ROWID;

-- every delivery from the central service is processed once (X-Razorpay-Event-Id); no message body is kept
CREATE TABLE webhook_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, rzp_event_id TEXT UNIQUE, event TEXT, signature_ok INTEGER NOT NULL, result TEXT NOT NULL, at_ms INTEGER NOT NULL
);
CREATE TRIGGER webhook_log_no_update BEFORE UPDATE ON webhook_log BEGIN SELECT RAISE(ABORT, 'append-only: UPDATE refused on webhook_log'); END;
CREATE TRIGGER webhook_log_no_delete BEFORE DELETE ON webhook_log BEGIN SELECT RAISE(ABORT, 'append-only: DELETE refused on webhook_log'); END;
