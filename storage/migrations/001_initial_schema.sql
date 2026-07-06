create extension if not exists "pgcrypto";

create table if not exists interview_sessions (
  id uuid primary key,
  status text not null check (status in (
    'created',
    'consent_pending',
    'in_progress',
    'completed',
    'cancelled',
    'failed'
  )),
  candidate_display_name text,
  target_role text,
  consent_status text not null default 'pending' check (consent_status in (
    'pending',
    'granted',
    'declined'
  )),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists interview_turns (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  turn_index integer not null,
  speaker text not null check (speaker in ('agent', 'candidate', 'system')),
  content text not null,
  audio_ref text,
  created_at timestamptz not null default now(),
  unique (session_id, turn_index)
);

create table if not exists interview_summaries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  profile_summary text not null default '',
  experience_summary text not null default '',
  tools_summary text not null default '',
  availability_summary text not null default '',
  human_review_notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists interview_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references interview_sessions(id) on delete cascade,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_interview_turns_session_order
  on interview_turns(session_id, turn_index);

create index if not exists idx_interview_events_session_created
  on interview_events(session_id, created_at);
