-- Free demonstration support, never a payment or purchased balance. Fixed once
-- per verified, consenting account; do not accept a client amount or event key.
create function public.test_checkout_bonus(p_actor uuid,p_action text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_existing integer;v_id uuid;v_granted boolean:=false;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor
   and email is not null and email_confirmed_at is not null
   and coalesce(is_anonymous,false)=false)then
  raise exception 'Verified email required for test bonus' using errcode='28000';
 end if;
 if (select version from public.legal_consent_events where user_id=p_actor order by id desc limit 1)is distinct from'2026-10-17.1'then
  raise exception 'Membership consent required for test bonus' using errcode='42501';
 end if;
 if p_action is null or p_action not in('status','claim')then
  raise exception 'Invalid test bonus action' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select amount into v_existing from public.lp_ledger
 where user_id=p_actor and bucket='earned'and event_key='test-checkout:welcome-v1';
 if v_existing is not null and v_existing<>100 then
  raise exception 'Test bonus ledger conflict' using errcode='LR409';
 end if;
 if p_action='claim'and v_existing is null then
  insert into public.lp_ledger(user_id,bucket,amount,event_key,reason)
  values(p_actor,'earned',100,'test-checkout:welcome-v1','Free one-time test bonus; no payment')returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_id)
  values(p_actor,'checkout.free_test_bonus',v_id);
  v_granted:=true;v_existing:=100;
 end if;
 return jsonb_build_object('claimed',v_existing is not null,'granted',v_granted,'amount',100);
end;$$;
revoke all on function public.test_checkout_bonus(uuid,text)from public,anon,authenticated;
grant execute on function public.test_checkout_bonus(uuid,text)to service_role;
