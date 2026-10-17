-- IQ-03: fail closed on missing, JSON null and wrong-type accounting inputs.
-- IQ-04: replay an existing owner's identical intent before current policy checks.
-- No policy activation, grants, rewards or data changes are performed here.
create or replace function public.planning_action(p_actor uuid,p_action text,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_policy public.lp_policy%rowtype;v_request public.planning_requests%rowtype;v_plan public.itineraries%rowtype;
 v_month date:=date_trunc('month',now()at time zone'Asia/Seoul')::date;v_expires timestamptz;
 v_promo bigint;v_earned bigint;v_count int;v_id uuid;v_promo_use int;v_earned_use int;v_result jsonb;
 v_candidate jsonb;v_day jsonb;v_stop jsonb;v_check text;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)then raise exception 'User required' using errcode='28000';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into v_policy from public.lp_policy where singleton;
 -- Resolve same-owner retries against their original payload before today's policy,
 -- promotion issuance or hold calculations. Existing accepted work is immutable.
 if p_action='reserve' then
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Price confirmation required' using errcode='22023';end if;
  select * into v_request from public.planning_requests where user_id=p_actor and request_id=p_request_id for update;
  if found then
   if v_request.input is distinct from p_payload then raise exception 'Idempotency conflict' using errcode='LR409';end if;
   if v_request.status='ready'then return jsonb_build_object('status','ready','id',v_request.id,'result',(select result from public.itineraries where source_request_id=v_request.id));end if;
   return jsonb_build_object('status',case when v_request.expires_at<=now()then'failed'else v_request.status end,'id',v_request.id,'replay',true);
  end if;
  if jsonb_typeof(p_payload->'input') is distinct from 'object'
   or p_payload->'consent' is distinct from 'true'::jsonb
   or p_payload->'expectedCost' is distinct from to_jsonb(v_policy.plan_cost)
   or p_payload->'policyVersion' is distinct from to_jsonb(v_policy.version)
  then raise exception 'Price confirmation required' using errcode='22023';end if;
 end if;
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
  -- This is a structural DB boundary, not a substitute for server-side route,
  -- opening-hour, provenance freshness and preference evaluation.
  v_result:=p_payload->'result';
  if jsonb_typeof(v_result) is distinct from 'object'
   or v_result->'provenance' is distinct from '"gemini"'::jsonb
   or jsonb_typeof(v_result->'evaluation') is distinct from 'object'
   or jsonb_typeof(v_result->'catalog') is distinct from 'array'
   or jsonb_typeof(v_result->'schedule') is distinct from 'object'
  then raise exception 'Invalid generated plan' using errcode='22023';end if;
  if v_result->'evaluation'->'valid' is distinct from 'true'::jsonb
   or jsonb_typeof(v_result->'evaluation'->'errors') is distinct from 'array'
   or jsonb_typeof(v_result->'evaluation'->'warnings') is distinct from 'array'
   or jsonb_typeof(v_result->'evaluation'->'checks') is distinct from 'object'
   or jsonb_typeof(v_result->'schedule'->'days') is distinct from 'array'
   or jsonb_typeof(v_result->'schedule'->'title') is distinct from 'string'
   or jsonb_typeof(v_result->'schedule'->'summary') is distinct from 'string'
  then raise exception 'Invalid generated plan' using errcode='22023';end if;
  if jsonb_array_length(v_result->'catalog')<2
   or jsonb_array_length(v_result->'evaluation'->'errors')<>0
   or jsonb_array_length(v_result->'schedule'->'days') not between 1 and 5
   or length(btrim(v_result->'schedule'->>'title'))<3
   or length(btrim(v_result->'schedule'->>'summary'))<10
  then raise exception 'Invalid generated plan' using errcode='22023';end if;
  foreach v_check in array array['stopCount','localMeals','preferenceMatches','verifiedHours'] loop
   if jsonb_typeof(v_result->'evaluation'->'checks'->v_check) is distinct from 'number' then raise exception 'Invalid generated plan' using errcode='22023';end if;
   if (v_result->'evaluation'->'checks'->>v_check)::numeric<0 or mod((v_result->'evaluation'->'checks'->>v_check)::numeric,1)<>0 then raise exception 'Invalid generated plan' using errcode='22023';end if;
  end loop;
  for v_candidate in select value from jsonb_array_elements(v_result->'catalog') loop
   if jsonb_typeof(v_candidate) is distinct from 'object' or jsonb_typeof(v_candidate->'id') is distinct from 'string' then raise exception 'Invalid generated plan' using errcode='22023';end if;
   if length(btrim(v_candidate->>'id'))=0 then raise exception 'Invalid generated plan' using errcode='22023';end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(v_result->'catalog'))<>jsonb_array_length(v_result->'catalog') then raise exception 'Invalid generated plan' using errcode='22023';end if;
  v_count:=0;
  for v_day in select value from jsonb_array_elements(v_result->'schedule'->'days') loop
   if jsonb_typeof(v_day) is distinct from 'object' or jsonb_typeof(v_day->'date') is distinct from 'string' or jsonb_typeof(v_day->'stops') is distinct from 'array' then raise exception 'Invalid generated plan' using errcode='22023';end if;
   if v_day->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_array_length(v_day->'stops') not between 2 and 8 then raise exception 'Invalid generated plan' using errcode='22023';end if;
   v_count:=v_count+jsonb_array_length(v_day->'stops');
   for v_stop in select value from jsonb_array_elements(v_day->'stops') loop
    if jsonb_typeof(v_stop) is distinct from 'object'
     or jsonb_typeof(v_stop->'candidateId') is distinct from 'string'
     or jsonb_typeof(v_stop->'start') is distinct from 'string'
     or jsonb_typeof(v_stop->'end') is distinct from 'string'
     or jsonb_typeof(v_stop->'purpose') is distinct from 'string'
     or jsonb_typeof(v_stop->'explanation') is distinct from 'string'
    then raise exception 'Invalid generated plan' using errcode='22023';end if;
    if v_stop->>'start' !~ '^([01]\d|2[0-3]):[0-5]\d$'
     or v_stop->>'end' !~ '^([01]\d|2[0-3]):[0-5]\d$'
     or v_stop->>'end'<=v_stop->>'start'
     or v_stop->>'purpose' not in ('visit','lunch','dinner','break')
     or length(btrim(v_stop->>'explanation'))<10
     or not exists(select 1 from jsonb_array_elements(v_result->'catalog')c where c->>'id'=v_stop->>'candidateId')
    then raise exception 'Invalid generated plan' using errcode='22023';end if;
   end loop;
  end loop;
  if (v_result->'evaluation'->'checks'->>'stopCount')::numeric<>v_count then raise exception 'Invalid generated plan' using errcode='22023';end if;
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

