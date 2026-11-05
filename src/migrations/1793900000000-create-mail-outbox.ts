import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMailOutbox1793900000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE email_notifications (
        id uuid PRIMARY KEY, event_id uuid NOT NULL, recipient text NOT NULL,
        provider_account text NOT NULL, type text NOT NULL, evidence_id integer,
        user_id integer, payload text, payload_version integer NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN
          ('pending','sending','retry_wait','blocked','accepted','dead','expired','cancelled','uncertain')),
        attempt_count integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 8, priority integer NOT NULL DEFAULT 10,
        next_attempt_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
        locked_until timestamptz, lease_token uuid, last_error_category text,
        provider_message_id text, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(event_id, recipient)
      );
      CREATE INDEX email_notifications_due ON email_notifications(priority,next_attempt_at)
        WHERE status IN ('pending','retry_wait');
      CREATE INDEX email_notifications_leases ON email_notifications(locked_until) WHERE status='sending';
      CREATE TABLE email_provider_state (
        account text PRIMARY KEY, paused boolean NOT NULL DEFAULT false,
        reason text, next_send_at timestamptz NOT NULL DEFAULT now(),
        active_until timestamptz, active_lease uuid,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE email_attempts (
        id bigserial PRIMARY KEY, notification_id uuid NOT NULL REFERENCES email_notifications(id) ON DELETE CASCADE,
        attempt integer NOT NULL, result text NOT NULL, category text, smtp_code integer,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE email_worker_heartbeat (
        name text PRIMARY KEY, updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }
  async down(runner: QueryRunner): Promise<void> {
    const [{ count }] = await runner.query(
      `SELECT count(*) FROM email_notifications WHERE status NOT IN ('accepted','expired','cancelled')`,
    );
    if (Number(count))
      throw new Error(
        'Outbox contains unresolved mail; export/review before reverting',
      );
    await runner.query(
      'DROP TABLE email_attempts, email_notifications, email_provider_state, email_worker_heartbeat',
    );
  }
}
