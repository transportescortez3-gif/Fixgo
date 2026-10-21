-- Support ticket system (replaces disputes)
CREATE TABLE IF NOT EXISTS support_tickets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  status      TEXT NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_responses (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  admin_id    INTEGER NOT NULL REFERENCES users(id),
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_responses_ticket_id ON ticket_responses(ticket_id);
