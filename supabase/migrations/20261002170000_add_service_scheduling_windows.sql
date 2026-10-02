alter table public.service_levels
  add column if not exists max_schedule_minutes integer,
  add column if not exists schedule_start_minute integer,
  add column if not exists schedule_end_minute integer,
  add column if not exists schedule_interval_minutes integer;

alter table public.service_levels
  add constraint service_levels_schedule_window_check
  check (max_schedule_minutes is null or max_schedule_minutes > 0);

alter table public.service_levels
  add constraint service_levels_schedule_hours_check
  check (
    schedule_start_minute is null
    or (
      schedule_start_minute between 0 and 1439
      and schedule_end_minute between 1 and 1440
      and schedule_end_minute > schedule_start_minute
      and schedule_interval_minutes is not null
      and schedule_interval_minutes > 0
    )
  );

comment on column public.service_levels.max_schedule_minutes is 'Maximum future scheduling horizon for this service level, in minutes.';
comment on column public.service_levels.schedule_start_minute is 'Local-day start minute for customer scheduling slots.';
comment on column public.service_levels.schedule_end_minute is 'Local-day end minute for customer scheduling slots.';
comment on column public.service_levels.schedule_interval_minutes is 'Customer scheduling slot interval in minutes.';