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
-- Existing Admin requests retain their role when expanding code-free registration.
ALTER TABLE admin_registration_requests ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'ADMIN' CHECK(role IN ('ADMIN','FACULTY','TRANSPORT'));

-- The chosen registration policy now activates valid staff requests immediately.
-- Running this migration again preserves existing users and their credentials.
WITH created AS (
 INSERT INTO users(name,email,password_hash,role)
 SELECT name,email,password_hash,role FROM admin_registration_requests WHERE status='PENDING'
 ON CONFLICT(email) DO NOTHING RETURNING id,email
), activated AS (
 UPDATE admin_registration_requests r
 SET status='APPROVED',password_hash=NULL,handled_by=NULL,handled_at=now(),user_id=u.id
 FROM created u WHERE r.email=u.email AND r.status='PENDING'
 RETURNING r.id,r.user_id,r.role
)
INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,after_value)
SELECT user_id,'AUTO_ACTIVATE_REGISTRATION','user',user_id,
 jsonb_build_object('registrationId',id,'role',role,'activation','automatic') FROM activated;

WITH closed AS (
 UPDATE admin_registration_requests r
 SET status='DECLINED',password_hash=NULL,handled_by=NULL,handled_at=now()
 WHERE status='PENDING' AND EXISTS(SELECT 1 FROM users u WHERE u.email=r.email)
 RETURNING id,role
)
INSERT INTO audit_logs(action,entity_type,entity_id,after_value)
SELECT 'AUTO_CLOSE_DUPLICATE_REGISTRATION','registration',id,
 jsonb_build_object('requestedRole',role,'reason','Existing account preserved') FROM closed;
