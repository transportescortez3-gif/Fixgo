-- Conversaciones directas entre usuarios de confianza
CREATE TABLE IF NOT EXISTS direct_conversations (
  id          SERIAL PRIMARY KEY,
  user_a_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT check_user_order CHECK (user_a_id < user_b_id),
  CONSTRAINT uq_direct_conv UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  encrypted       BOOLEAN DEFAULT FALSE,
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_direct_conv_a    ON direct_conversations(user_a_id);
CREATE INDEX IF NOT EXISTS idx_direct_conv_b    ON direct_conversations(user_b_id);
CREATE INDEX IF NOT EXISTS idx_direct_msgs_conv ON direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_direct_msgs_sndr ON direct_messages(sender_id);
