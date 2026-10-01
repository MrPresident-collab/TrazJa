create table public.delivery_policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_code text not null,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (delivery_id, user_id, policy_code)
);

alter table public.delivery_policy_acceptances enable row level security;

create index delivery_policy_acceptances_delivery_id_idx on public.delivery_policy_acceptances(delivery_id);
create index delivery_policy_acceptances_user_id_idx on public.delivery_policy_acceptances(user_id);

create policy "delivery_policy_self_insert"
on public.delivery_policy_acceptances
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.deliveries d
    where d.id = delivery_policy_acceptances.delivery_id
      and d.requester_id = (select auth.uid())
      and d.status = 'draft'::delivery_status
  )
);

create policy "delivery_policy_self_select"
on public.delivery_policy_acceptances
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_role('operations'::app_role))
);

grant select, insert on public.delivery_policy_acceptances to authenticated;

alter table public.delivery_stops
  add column alternative_contact_phone text;
