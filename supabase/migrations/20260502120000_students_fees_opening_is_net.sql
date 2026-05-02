-- When true, closing_fees_balance is already net of prior-session receipts (e.g. after promotion
-- carry-forward). UI must not subtract prior-year student_fees again (avoids double-counting).
alter table public.students
  add column if not exists fees_opening_is_net boolean not null default false;

comment on column public.students.fees_opening_is_net is
  'If true, closing_fees_balance is net opening (post promotion); do not reduce by prior-year payments again.';
