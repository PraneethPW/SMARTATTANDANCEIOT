ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS staff_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL,
 role text NOT NULL CHECK(role IN ('ADMIN','FACULTY','TRANSPORT')),
 token_hash text NOT NULL UNIQUE, created_by uuid NOT NULL REFERENCES users(id),
 expires_at timestamptz NOT NULL, used_at timestamptz, used_by uuid REFERENCES users(id),
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_recovery_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','LINK_ISSUED','COMPLETED')),
 requested_at timestamptz NOT NULL DEFAULT now(), handled_by uuid REFERENCES users(id),
 handled_at timestamptz, delivery_status text NOT NULL DEFAULT 'ADMIN_REQUIRED'
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_recovery_request ON account_recovery_requests(user_id) WHERE status IN ('PENDING','LINK_ISSUED');
CREATE TABLE IF NOT EXISTS password_reset_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 request_id uuid NOT NULL REFERENCES account_recovery_requests(id),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS active_password_resets_by_user ON password_reset_tokens(user_id) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_registration_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
 email text NOT NULL UNIQUE, password_hash text,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','DECLINED')),
 requested_at timestamptz NOT NULL DEFAULT now(), handled_at timestamptz,
 handled_by uuid REFERENCES users(id), user_id uuid REFERENCES users(id),
 CHECK ((status='PENDING' AND password_hash IS NOT NULL) OR (status<>'PENDING' AND password_hash IS NULL))
);
