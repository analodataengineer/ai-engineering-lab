alter table interview_sessions
  add column if not exists candidate_email text;

create table if not exists interview_email_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  template_name text not null,
  recipient_email text not null,
  provider text not null,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  idempotency_key text not null,
  message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (session_id, template_name)
);

create index if not exists idx_interview_email_events_status
  on interview_email_events(status);
