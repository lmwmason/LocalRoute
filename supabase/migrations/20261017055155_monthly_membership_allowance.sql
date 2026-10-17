-- Monthly membership LP is independent of itinerary price/feature availability.
-- Preserve all historical grants and append-only ledger rows, including 300-LP
-- allowances already issued before this policy update. Never claw them back.
alter table public.lp_policy alter column monthly_promo set default 100;
update public.lp_policy set monthly_promo=100 where singleton;

-- Protect every monthly grant entry point, including the older paid planner.
create or replace function public.require_membership_for_lp_grant()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from auth.users where id=new.user_id
   and email is not null and email_confirmed_at is not null
   and coalesce(is_anonymous,false)=false)then
  raise exception 'Verified email required for LP allowance' using errcode='28000';
 end if;
 if (select version from public.legal_consent_events where user_id=new.user_id order by id desc limit 1)is distinct from'2026-10-17.1'then
  raise exception 'Membership consent required for LP allowance' using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function public.require_membership_for_lp_grant()from public,anon,authenticated;

-- Only the authenticated server may claim for its verified actor. The browser
-- cannot supply an actor directly to this RPC. One transaction owns both rows.
create function public.claim_monthly_lp(p_actor uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_month date:=date_trunc('month',now()at time zone'Asia/Seoul')::date;
 v_expires timestamptz;v_amount integer;v_count integer;v_existing integer;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor
   and email is not null and email_confirmed_at is not null
   and coalesce(is_anonymous,false)=false)then
  raise exception 'Verified email required for LP allowance' using errcode='28000';
 end if;
 if (select version from public.legal_consent_events where user_id=p_actor order by id desc limit 1)is distinct from'2026-10-17.1'then
  raise exception 'Membership consent required for LP allowance' using errcode='42501';
 end if;
 -- Same lock as planning_action, so claims and paid reservations serialize.
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select monthly_promo into strict v_amount from public.lp_policy where singleton for share;
 v_expires:=(v_month+interval'1 month')at time zone'Asia/Seoul';
 insert into public.monthly_lp_grants(user_id,month,amount)
 values(p_actor,v_month,v_amount)on conflict(user_id,month)do nothing;
 get diagnostics v_count=row_count;
 if v_count=1 and v_amount>0 then
  insert into public.lp_ledger(user_id,bucket,amount,event_key,reason,expires_at)
  values(p_actor,'promo',v_amount,'monthly:'||v_month::text,'Monthly membership allowance',v_expires);
 end if;
 select amount into strict v_existing from public.monthly_lp_grants where user_id=p_actor and month=v_month;
 return jsonb_build_object('granted',v_count=1,'amount',v_existing,'month',v_month,'expiresAt',v_expires);
end;$$;
revoke all on function public.claim_monthly_lp(uuid)from public,anon,authenticated;
grant execute on function public.claim_monthly_lp(uuid)to service_role;
