create table public.lp_policy (
  singleton boolean primary key default true check(singleton),version text not null default 'pilot-v1',
  planning_enabled boolean not null default false,rewards_enabled boolean not null default false,
  plan_cost integer not null default 100 check(plan_cost between 1 and 10000),monthly_promo integer not null default 300 check(monthly_promo between 0 and 10000)
);
insert into public.lp_policy(singleton)values(true);
create table public.lp_ledger (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
  bucket text not null check(bucket in ('promo','earned')),amount integer not null check(amount<>0),
  event_key text not null,reason text not null,expires_at timestamptz,
  created_at timestamptz not null default now(),unique(user_id,bucket,event_key),
  check((bucket='promo' and expires_at is not null)or(bucket='earned' and expires_at is null))
);
create index lp_ledger_balance_idx on public.lp_ledger(user_id,bucket,expires_at);
create function public.keep_ledger_append_only() returns trigger language plpgsql set search_path='' as $$begin raise exception 'LP ledger is append-only' using errcode='42501';end;$$;
revoke all on function public.keep_ledger_append_only() from public,anon,authenticated;
create trigger ledger_no_update before update or delete on public.lp_ledger for each row execute function public.keep_ledger_append_only();
create table public.monthly_lp_grants(user_id uuid not null references auth.users(id),month date not null,amount integer not null,created_at timestamptz not null default now(),primary key(user_id,month));
create table public.planning_requests (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),request_id uuid not null,
  input jsonb not null,status text not null default 'generating' check(status in ('generating','ready','failed')),
  cost integer not null check(cost>0),promo_reserved integer not null check(promo_reserved>=0),earned_reserved integer not null check(earned_reserved>=0),
  promo_expires timestamptz not null,expires_at timestamptz not null,failure_code text,created_at timestamptz not null default now(),unique(user_id,request_id),
  check(cost=promo_reserved+earned_reserved)
);
create index planning_requests_holds_idx on public.planning_requests(user_id,status,expires_at);
create table public.itineraries (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),source_request_id uuid unique references public.planning_requests(id),
  result jsonb not null,revision integer not null default 1 check(revision>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index itineraries_user_idx on public.itineraries(user_id,created_at);
alter table public.lp_policy enable row level security;
alter table public.lp_ledger enable row level security;
alter table public.monthly_lp_grants enable row level security;
alter table public.planning_requests enable row level security;
alter table public.itineraries enable row level security;
revoke all on public.lp_policy,public.lp_ledger,public.monthly_lp_grants,public.planning_requests,public.itineraries from anon,authenticated;
grant select on public.lp_ledger,public.monthly_lp_grants,public.planning_requests,public.itineraries to authenticated;
grant all on public.lp_policy,public.lp_ledger,public.monthly_lp_grants,public.planning_requests,public.itineraries to service_role;
create policy ledger_own on public.lp_ledger for select to authenticated using(user_id=(select auth.uid()));
create policy grants_own on public.monthly_lp_grants for select to authenticated using(user_id=(select auth.uid()));
create policy planning_requests_own on public.planning_requests for select to authenticated using(user_id=(select auth.uid()));
create policy itineraries_own on public.itineraries for select to authenticated using(user_id=(select auth.uid()));

create function public.planning_action(p_actor uuid,p_action text,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_policy public.lp_policy%rowtype;v_request public.planning_requests%rowtype;v_plan public.itineraries%rowtype;
 v_month date:=date_trunc('month',now()at time zone'Asia/Seoul')::date;v_expires timestamptz;
 v_promo bigint;v_earned bigint;v_count int;v_id uuid;v_promo_use int;v_earned_use int;v_result jsonb;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)then raise exception 'User required' using errcode='28000';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into v_policy from public.lp_policy where singleton;
 if p_action='list' then return coalesce((select jsonb_agg(jsonb_build_object('id',id,'result',result,'revision',revision)order by created_at desc)from public.itineraries where user_id=p_actor),'[]'::jsonb);end if;
 if p_action in ('get','save')then
  select * into v_plan from public.itineraries where id=(p_payload->>'id')::uuid and user_id=p_actor for update;
  if not found then raise exception 'Itinerary not found' using errcode='LR404';end if;
  if p_action='get'then return v_plan.result || jsonb_build_object('id',v_plan.id,'revision',v_plan.revision);end if;
  if v_plan.revision<>(p_payload->>'revision')::int then raise exception 'Revision conflict' using errcode='LR409';end if;
  if p_payload->'result'->'evaluation'->>'valid' is distinct from 'true' then raise exception 'Invalid itinerary' using errcode='22023';end if;
  v_result:=p_payload->'result'||jsonb_build_object('id',v_plan.id,'revision',v_plan.revision+1);
  update public.itineraries set result=v_result,revision=revision+1,updated_at=now()where id=v_plan.id;
  insert into public.audit_logs(actor_id,action,entity_id)values(p_actor,'itinerary.edited',v_plan.id);
  return v_result;
 end if;
 if p_action='balance'and not v_policy.planning_enabled then
  select coalesce(sum(amount),0)into v_promo from public.lp_ledger where user_id=p_actor and bucket='promo'and expires_at>now();
  select coalesce(sum(amount),0)into v_earned from public.lp_ledger where user_id=p_actor and bucket='earned';
  v_promo:=v_promo-coalesce((select sum(promo_reserved)from public.planning_requests where user_id=p_actor and status='generating'and expires_at>now()),0);
  v_earned:=v_earned-coalesce((select sum(earned_reserved)from public.planning_requests where user_id=p_actor and status='generating'and expires_at>now()),0);
  return jsonb_build_object('enabled',false,'cost',v_policy.plan_cost,'policyVersion',v_policy.version,'promo',v_promo,'earned',v_earned,'held',coalesce((select sum(cost)from public.planning_requests where user_id=p_actor and status='generating'and expires_at>now()),0));
 end if;
 if p_action in ('balance','reserve')then
  if not v_policy.planning_enabled then raise exception 'Planning disabled by policy' using errcode='LR503';end if;
  v_expires:=(v_month+interval'1 month')at time zone'Asia/Seoul';
  insert into public.monthly_lp_grants(user_id,month,amount)values(p_actor,v_month,v_policy.monthly_promo)on conflict do nothing;get diagnostics v_count=row_count;
  if v_count=1 and v_policy.monthly_promo>0 then
   insert into public.lp_ledger(user_id,bucket,amount,event_key,reason,expires_at)values(p_actor,'promo',v_policy.monthly_promo,'monthly:'||v_month::text,'Monthly promotional allowance',v_expires);
  end if;
  select coalesce(sum(amount),0)into v_promo from public.lp_ledger where user_id=p_actor and bucket='promo'and expires_at>now();
  select coalesce(sum(amount),0)into v_earned from public.lp_ledger where user_id=p_actor and bucket='earned';
  v_promo:=v_promo-coalesce((select sum(promo_reserved)from public.planning_requests where user_id=p_actor and status='generating'and expires_at>now()),0);
  v_earned:=v_earned-coalesce((select sum(earned_reserved)from public.planning_requests where user_id=p_actor and status='generating'and expires_at>now()),0);
  if p_action='balance'then return jsonb_build_object('enabled',true,'cost',v_policy.plan_cost,'policyVersion',v_policy.version,'promo',v_promo,'earned',v_earned,'promoExpires',v_expires,'held',coalesce((select sum(cost)from public.planning_requests where user_id=p_actor and status='generating'and expires_at>now()),0));end if;
  if p_request_id is null or p_payload->>'consent' is distinct from'true' or (p_payload->>'expectedCost')::int<>v_policy.plan_cost or p_payload->>'policyVersion'<>v_policy.version then raise exception 'Price confirmation required' using errcode='22023';end if;
  select * into v_request from public.planning_requests where user_id=p_actor and request_id=p_request_id;
  if found then
   if v_request.input<>p_payload then raise exception 'Idempotency conflict' using errcode='LR409';end if;
   if v_request.status='ready'then return jsonb_build_object('status','ready','id',v_request.id,'result',(select result from public.itineraries where source_request_id=v_request.id));end if;
   return jsonb_build_object('status',case when v_request.expires_at<=now()then'failed'else v_request.status end,'id',v_request.id,'replay',true);
  end if;
  if v_promo+v_earned<v_policy.plan_cost then raise exception 'Insufficient LP' using errcode='LR402';end if;
  if (select count(*)from public.planning_requests where user_id=p_actor and created_at>now()-interval'1 day')>=10 then raise exception 'Daily generation limit' using errcode='LR429';end if;
  v_promo_use:=least(v_promo,v_policy.plan_cost);v_earned_use:=v_policy.plan_cost-v_promo_use;
  insert into public.planning_requests(user_id,request_id,input,cost,promo_reserved,earned_reserved,promo_expires,expires_at)values(p_actor,p_request_id,p_payload,v_policy.plan_cost,v_promo_use,v_earned_use,v_expires,least(now()+interval'10 minutes',v_expires))returning id into v_id;
  insert into public.audit_logs(actor_id,action,entity_id)values(p_actor,'planning.reserved',v_id);
  return jsonb_build_object('status','generating','id',v_id,'replay',false,'cost',v_policy.plan_cost);
 end if;
 select * into v_request from public.planning_requests where user_id=p_actor and request_id=p_request_id for update;
 if not found then raise exception 'Request not found' using errcode='LR404';end if;
 if p_action='status'then return jsonb_build_object('id',v_request.id,'status',case when v_request.status='generating'and v_request.expires_at<=now()then'failed'else v_request.status end,'result',(select result from public.itineraries where source_request_id=v_request.id));end if;
 if p_action='fail'then
  update public.planning_requests set status='failed',failure_code=left(coalesce(p_payload->>'code','GENERATION_FAILED'),80)where id=v_request.id and status='generating';
  insert into public.audit_logs(actor_id,action,entity_id)values(p_actor,'planning.released',v_request.id);
  return jsonb_build_object('status',case when v_request.status='ready'then'ready'else'failed'end);
 end if;
 if p_action='finalize'then
  if v_request.status='ready'then return(select result from public.itineraries where source_request_id=v_request.id);end if;
  if v_request.status<>'generating'or v_request.expires_at<=now()then raise exception 'Reservation expired' using errcode='LR410';end if;
  if p_payload->'result'->'evaluation'->>'valid' is distinct from'true'or p_payload->'result'->>'provenance'<>'gemini'or jsonb_array_length(p_payload->'result'->'catalog')<2 then raise exception 'Invalid generated plan' using errcode='22023';end if;
  v_result:=p_payload->'result'||jsonb_build_object('id',v_request.id,'revision',1,'cost',v_request.cost);
  insert into public.itineraries(id,user_id,source_request_id,result)values(v_request.id,p_actor,v_request.id,v_result);
  if v_request.promo_reserved>0 then insert into public.lp_ledger(user_id,bucket,amount,event_key,reason,expires_at)values(p_actor,'promo',-v_request.promo_reserved,'plan:'||v_request.id::text,'Validated itinerary saved',v_request.promo_expires);end if;
  if v_request.earned_reserved>0 then insert into public.lp_ledger(user_id,bucket,amount,event_key,reason)values(p_actor,'earned',-v_request.earned_reserved,'plan:'||v_request.id::text,'Validated itinerary saved');end if;
  update public.planning_requests set status='ready'where id=v_request.id;
  insert into public.audit_logs(actor_id,action,entity_id)values(p_actor,'planning.charged',v_request.id);
  return v_result;
 end if;
 raise exception 'Unknown planning action' using errcode='22023';
end;
$$;
revoke all on function public.planning_action(uuid,text,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.planning_action(uuid,text,uuid,jsonb)to service_role;
