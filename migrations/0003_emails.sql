-- plan §3, §2.3: log of sent emails; the only channel of the email stub (T020).
CREATE TABLE emails (
  id INTEGER PRIMARY KEY,
  "to" TEXT NOT NULL,
  template TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}', -- JSON
  sent_at TEXT NOT NULL
);

CREATE INDEX idx_emails_template ON emails(template);
