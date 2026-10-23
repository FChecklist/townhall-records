-- AOA-RWA D1 schema 0006: recognise a returning person on the same link, and keep EVERYTHING the browser and the network tell us for each request.
-- access_audit stays append-only (the new columns are filled when the row is written). bsid_idx / bid_idx are keyed blind indexes of the browser-session id and of the
-- server-issued browser cookie id, so the same browser can be traced across rows without decrypting them.
ALTER TABLE access_audit ADD COLUMN bsid_idx TEXT;
ALTER TABLE access_audit ADD COLUMN bid_idx TEXT;
CREATE INDEX audit_bid ON access_audit(bid_idx);
ALTER TABLE handshakes ADD COLUMN browser_hash TEXT;      -- hash of the server-issued cookie id of the voter's browser (set when the link is first opened)
ALTER TABLE sessions ADD COLUMN browser_hash TEXT;
