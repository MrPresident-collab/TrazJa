create or replace function private.confirm_delivery_with_payment(
  p_delivery_id uuid,
  p_payment_method public.payment_method,
  p_gratuity_amount numeric default 0
)
returns public.deliveries
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  d public.deliveries;
  q public.delivery_quotes;
  w public.wallet_accounts;
  r public.deliveries;
  v_total numeric;
  v_payment_status public.payment_status;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_payment_method not in ('cash'::public.payment_method,'multicaixa'::public.payment_method,'wallet'::public.payment_method) then
    raise exception 'payment method is not currently available';
  end if;
  if p_gratuity_amount < 0 then raise exception 'invalid gratuity'; end if;
  if not exists (
    select 1 from public.delivery_policy_acceptances a
    where a.delivery_id=p_delivery_id and a.user_id=v_uid and a.policy_code='customer_delivery_terms'
  ) then raise exception 'delivery terms must be accepted'; end if;

  select * into d from public.deliveries where id=p_delivery_id and requester_id=v_uid for update;
  if not found then raise exception 'delivery not found'; end if;
  if d.status <> 'quoted' then raise exception 'delivery must have an active quote'; end if;

  select * into q from public.delivery_quotes where id=d.quote_id and delivery_id=d.id for update;
  if not found then raise exception 'quote not found'; end if;
  if q.valid_until is not null and q.valid_until <= now() then raise exception 'quote expired'; end if;

  v_total := q.total_amount + p_gratuity_amount;
  if exists (select 1 from public.payments where delivery_id=p_delivery_id) then
    raise exception 'payment already initialized for delivery';
  end if;

  if p_payment_method='wallet'::public.payment_method then
    select * into w from public.wallet_accounts where user_id=v_uid and currency='AOA' and status='active' for update;
    if not found then raise exception 'active PegaJá Wallet not found'; end if;
    if w.balance < v_total then raise exception 'insufficient wallet balance'; end if;
    update public.wallet_accounts set balance=balance-v_total, updated_at=now() where id=w.id;
    insert into public.wallet_transactions(wallet_id,delivery_id,direction,amount,currency,status,idempotency_key,metadata)
    values(w.id,p_delivery_id,'debit',v_total,'AOA','posted','delivery-confirm:'||p_delivery_id,jsonb_build_object('purpose','delivery_payment','quote_id',q.id));
    v_payment_status := 'paid'::public.payment_status;
  else
    v_payment_status := 'pending'::public.payment_status;
  end if;

  insert into public.payments(delivery_id,amount,currency,method,status,paid_at,provider_reference)
  values(p_delivery_id,v_total,'AOA',p_payment_method,v_payment_status,case when v_payment_status='paid'::public.payment_status then now() else null end,null);

  insert into public.delivery_gratuities(delivery_id,mode,amount,currency)
  values(p_delivery_id,case when p_gratuity_amount>0 then 'custom' else 'none' end,p_gratuity_amount,'AOA');

  update public.deliveries
  set payment_method=p_payment_method, gratuity_amount=p_gratuity_amount, total_amount=v_total, final_amount=v_total,
      status='confirmed', confirmed_at=now(), updated_at=now()
  where id=p_delivery_id returning * into r;

  insert into public.delivery_events(delivery_id,actor_id,event_type,from_status,to_status,metadata)
  values(p_delivery_id,v_uid,'delivery_confirmed','quoted','confirmed',
    jsonb_build_object('quote_id',q.id,'gratuity_amount',p_gratuity_amount,'payment_method',p_payment_method::text,'payment_status',v_payment_status::text,'total_amount',v_total));

  return r;
end
$function$;