-- TrazJá security hardening and concurrency-safe assignment acceptance.
-- Applied to Supabase project cswyxgawqqexytgcnjib on 2026-09-30.

alter function public.set_updated_at() set search_path = public, pg_temp;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

drop policy if exists deliveries_participant_select on public.deliveries;
create policy deliveries_participant_select
on public.deliveries for select to authenticated
using (
  requester_id = (select auth.uid())
  or (select private.has_role('operations'::app_role))
  or exists (
    select 1
    from public.delivery_assignments da
    where da.delivery_id = deliveries.id
      and da.courier_id = (select auth.uid())
      and da.status in ('offered','accepted')
  )
  or exists (
    select 1
    from public.business_members bm
    where bm.business_id = deliveries.business_id
      and bm.user_id = (select auth.uid())
  )
);

drop policy if exists events_participant_select on public.delivery_events;
create policy events_participant_select
on public.delivery_events for select to authenticated
using (
  exists (
    select 1
    from public.deliveries d
    where d.id = delivery_events.delivery_id
      and (
        d.requester_id = (select auth.uid())
        or (select private.has_role('operations'::app_role))
        or exists (
          select 1 from public.delivery_assignments da
          where da.delivery_id = d.id
            and da.courier_id = (select auth.uid())
            and da.status in ('offered','accepted')
        )
        or exists (
          select 1 from public.business_members bm
          where bm.business_id = d.business_id
            and bm.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists packages_participant_select on public.delivery_packages;
create policy packages_participant_select
on public.delivery_packages for select to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_packages.delivery_id
      and (
        d.requester_id = (select auth.uid())
        or (select private.has_role('operations'::app_role))
        or exists (
          select 1 from public.delivery_assignments da
          where da.delivery_id = d.id
            and da.courier_id = (select auth.uid())
            and da.status in ('offered','accepted')
        )
        or exists (
          select 1 from public.business_members bm
          where bm.business_id = d.business_id
            and bm.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists stops_participant_select on public.delivery_stops;
create policy stops_participant_select
on public.delivery_stops for select to authenticated
using (
  exists (
    select 1 from public.deliveries d
    where d.id = delivery_stops.delivery_id
      and (
        d.requester_id = (select auth.uid())
        or (select private.has_role('operations'::app_role))
        or exists (
          select 1 from public.delivery_assignments da
          where da.delivery_id = d.id
            and da.courier_id = (select auth.uid())
            and da.status in ('offered','accepted')
        )
        or exists (
          select 1 from public.business_members bm
          where bm.business_id = d.business_id
            and bm.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists businesses_insert_authenticated on public.businesses;
create policy businesses_insert_authenticated
on public.businesses for insert to authenticated
with check (
  (select private.has_role('operations'::app_role))
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role = 'business'::app_role
  )
);

create index if not exists idx_business_members_user on public.business_members(user_id);
create index if not exists idx_deliveries_business on public.deliveries(business_id);
create index if not exists idx_delivery_events_actor on public.delivery_events(actor_id);
create index if not exists idx_delivery_stops_address on public.delivery_stops(address_id);
create index if not exists idx_incidents_delivery on public.incidents(delivery_id);
create index if not exists idx_incidents_reporter on public.incidents(reporter_id);
create index if not exists idx_notifications_delivery on public.notifications(delivery_id);
create index if not exists idx_payments_delivery on public.payments(delivery_id);
create index if not exists idx_profiles_default_address on public.profiles(default_address_id);
create index if not exists idx_pod_courier on public.proof_of_delivery(courier_id);
create index if not exists idx_pod_delivery on public.proof_of_delivery(delivery_id);
create index if not exists idx_pod_stop on public.proof_of_delivery(stop_id);

create or replace function public.accept_delivery_assignment(p_assignment_id uuid)
returns public.delivery_assignments
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  result public.delivery_assignments;
begin
  update public.delivery_assignments
  set status = 'accepted',
      accepted_at = now()
  where id = p_assignment_id
    and courier_id = (select auth.uid())
    and status = 'offered'
  returning * into result;

  if result.id is null then
    raise exception 'Assignment is unavailable or not owned by the current courier'
      using errcode = '42501';
  end if;

  update public.deliveries
  set status = 'assigned',
      updated_at = now()
  where id = result.delivery_id
    and status in ('confirmed','dispatching','assigned');

  return result;
end;
$$;

revoke all on function public.accept_delivery_assignment(uuid) from public, anon;
grant execute on function public.accept_delivery_assignment(uuid) to authenticated;
