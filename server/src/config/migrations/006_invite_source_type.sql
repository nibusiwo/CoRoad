ALTER TABLE user_invites
  ADD COLUMN inviter_type VARCHAR(20) NOT NULL DEFAULT 'user' AFTER id;

CREATE INDEX idx_inviter_type_id ON user_invites (inviter_type, inviter_id);
