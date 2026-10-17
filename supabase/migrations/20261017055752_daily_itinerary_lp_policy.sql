-- Latest founder policy. Historical monthly grants and accepted requests remain
-- immutable; only new claims/new reservations use these parameters.
alter table public.lp_policy alter column monthly_promo set default 50;
alter table public.lp_policy alter column plan_cost set default 10;
update public.lp_policy set monthly_promo=50,plan_cost=10,version='daily-itinerary-v1' where singleton;

-- Keep the reviewed reservation/finalization implementation intact and patch
-- exactly one known boundary, after existing-request replay and before price
-- confirmation. Fail the migration if the expected implementation has changed.
do $migration$
declare
 v_definition text;
 v_marker text:=$marker$  if jsonb_typeof(p_payload->'input') is distinct from 'object'
   or p_payload->'consent' is distinct from 'true'::jsonb$marker$;
 v_insert text:=$insert$  -- Independent DB validation: inclusive calendar days, never a client day count.
  declare v_start date;v_end date;v_days integer;
  begin
   if jsonb_typeof(p_payload->'input'->'startDate') is distinct from 'string'
    or jsonb_typeof(p_payload->'input'->'endDate') is distinct from 'string'
    or p_payload->'input'->>'startDate' !~ '^\d{4}-\d{2}-\d{2}$'
    or p_payload->'input'->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$'
   then raise exception 'Price confirmation required: valid dates required' using errcode='22023';end if;
   v_start:=(p_payload->'input'->>'startDate')::date;
   v_end:=(p_payload->'input'->>'endDate')::date;
   v_days:=v_end-v_start+1;
   if v_days not between 1 and 5 then raise exception 'Price confirmation required: choose one to five days' using errcode='22023';end if;
   -- This local row copy becomes the total reservation price. Balance/quote
   -- actions still return the persisted per-day price without multiplication.
   v_policy.plan_cost:=v_policy.plan_cost*v_days;
  exception when invalid_datetime_format or datetime_field_overflow then
   raise exception 'Price confirmation required: valid dates required' using errcode='22023';
  end;
$insert$;
begin
 select pg_get_functiondef('public.planning_action(uuid,text,uuid,jsonb)'::regprocedure)into v_definition;
 if position('Independent DB validation: inclusive calendar days' in v_definition)>0
  or length(v_definition)-length(replace(v_definition,v_marker,''))<>length(v_marker)then
  raise exception 'Unexpected planning_action definition: daily-price patch requires review';
 end if;
 execute replace(v_definition,v_marker,v_insert||v_marker);
end;
$migration$;
