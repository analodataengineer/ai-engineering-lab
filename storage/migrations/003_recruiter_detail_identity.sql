alter table interview_sessions
  add column if not exists candidate_first_name text,
  add column if not exists candidate_last_name text,
  add column if not exists interview_token text,
  add column if not exists completed_at timestamptz;

create unique index if not exists idx_interview_sessions_interview_token
  on interview_sessions(interview_token)
  where interview_token is not null;
