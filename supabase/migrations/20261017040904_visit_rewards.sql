-- Local artifact only. No balances, existing ledger triggers or existing migrations are replaced.
create table public.visit_reward_policy (
 singleton boolean primary key default true check(singleton), version integer not null default 1 check(version>0),
 enabled boolean not null default false,
 amounts integer[] not null default array[0,2,8,15,20]
  check(array_ndims(amounts)=1 and array_lower(amounts,1)=1 and array_length(amounts,1)=5 and array_position(amounts,null) is null and 0<=all(amounts) and 10000>=all(amounts)),
 place_month_cap integer not null default 300 check(place_month_cap between 0 and 1000000),
 curator_month_cap integer not null default 1000 check(curator_month_cap between 0 and 1000000)
);
insert into public.visit_reward_policy(singleton) values(true);
create table public.visit_reward_affiliations (
 user_id uuid not null references auth.users(id), place_id uuid not null references public.places(id),
 kind text not null check(kind in ('owner','affiliate')), active boolean not null default true,
 reason text not null check(length(btrim(reason)) between 10 and 2000), updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now(), primary key(user_id,place_id)
);
create table public.visit_reward_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), request_id uuid not null,
 rating_id uuid not null references public.endorsement_ratings(id), review_id uuid not null references public.place_reviews(id),
 endorsement_version_id uuid not null references public.endorsement_versions(id), curator_id uuid not null references auth.users(id),
 place_id uuid not null references public.places(id), visited_on date not null,
 helpfulness smallint not null check(helpfulness between 1 and 5), version_number integer not null, version_text text not null,
 affiliated boolean not null, evidence text not null check(length(btrim(evidence)) between 10 and 2000),
 input jsonb not null, state text not null default 'pending' check(state in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), unique(user_id,request_id)
);
create unique index visit_reward_one_open_visit on public.visit_reward_requests(user_id,place_id,visited_on) where state in ('pending','approved');
create index visit_reward_queue on public.visit_reward_requests(state,created_at);
create table public.visit_reward_decisions (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.visit_reward_requests(id),
 actor_id uuid not null references auth.users(id), client_request_id uuid not null,
 decision text not null check(decision in ('approve','reject')), reason text not null check(length(btrim(reason)) between 10 and 2000),
 evidence_summary text not null check(length(btrim(evidence_summary)) between 20 and 2000),
 independent_evidence boolean not null, affiliations_checked boolean not null, collusion_checked boolean not null,
 input jsonb not null, created_at timestamptz not null default now(), unique(actor_id,client_request_id)
);
create table public.visit_reward_grants (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.visit_reward_requests(id),
 visitor_id uuid not null references auth.users(id), place_id uuid not null references public.places(id), curator_id uuid not null references auth.users(id),
 endorsement_version_id uuid not null references public.endorsement_versions(id), visited_on date not null,
 amount integer not null check(amount>=0), ledger_id uuid unique references public.lp_ledger(id),
 policy_snapshot jsonb not null, cap_month date not null, issued_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check((amount=0 and ledger_id is null) or (amount>0 and ledger_id is not null))
);
create index visit_reward_window on public.visit_reward_grants(visitor_id,place_id,visited_on);
create index visit_reward_place_cap on public.visit_reward_grants(place_id,cap_month);
create index visit_reward_curator_cap on public.visit_reward_grants(curator_id,cap_month);
create table public.visit_reward_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id),
 action text not null, entity_id uuid, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.visit_reward_policy enable row level security;
alter table public.visit_reward_affiliations enable row level security;
alter table public.visit_reward_requests enable row level security;
alter table public.visit_reward_decisions enable row level security;
alter table public.visit_reward_grants enable row level security;
alter table public.visit_reward_audit enable row level security;
revoke all on public.visit_reward_policy,public.visit_reward_affiliations,public.visit_reward_requests,public.visit_reward_decisions,public.visit_reward_grants,public.visit_reward_audit from public,anon,authenticated;
grant all on public.visit_reward_policy,public.visit_reward_affiliations,public.visit_reward_requests,public.visit_reward_decisions,public.visit_reward_grants,public.visit_reward_audit to service_role;
grant select on public.visit_reward_requests,public.visit_reward_decisions,public.visit_reward_grants to authenticated;
create policy visit_reward_requests_own on public.visit_reward_requests for select to authenticated using(user_id=(select auth.uid()));
create policy visit_reward_decisions_own on public.visit_reward_decisions for select to authenticated using(exists(select 1 from public.visit_reward_requests r where r.id=visit_reward_decisions.request_id and r.user_id=(select auth.uid())));
create policy visit_reward_grants_own on public.visit_reward_grants for select to authenticated using(visitor_id=(select auth.uid()));

create function public.visit_reward_immutable() returns trigger language plpgsql security invoker set search_path='' as $$begin raise exception 'Visit reward evidence is append-only' using errcode='42501';end;$$;
revoke all on function public.visit_reward_immutable() from public,anon,authenticated;
create trigger visit_reward_decisions_immutable before update or delete on public.visit_reward_decisions for each row execute function public.visit_reward_immutable();
create trigger visit_reward_grants_immutable before update or delete on public.visit_reward_grants for each row execute function public.visit_reward_immutable();
create trigger visit_reward_audit_immutable before update or delete on public.visit_reward_audit for each row execute function public.visit_reward_immutable();

create function public.visit_reward_view(r public.visit_reward_requests) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',r.id,'requestId',r.request_id,'visitorId',r.user_id,'placeId',r.place_id,'placeName',(select name from public.places where id=r.place_id),'curatorId',r.curator_id,
 'ratingId',r.rating_id,'endorsementVersionId',r.endorsement_version_id,'versionNumber',r.version_number,'versionText',r.version_text,
 'visitedOn',r.visited_on,'helpfulness',r.helpfulness,'affiliated',r.affiliated,'evidence',r.evidence,'state',r.state,'createdAt',r.created_at,
 'decision',(select jsonb_build_object('decision',d.decision,'reason',d.reason,'evidenceSummary',d.evidence_summary,'reviewerId',d.actor_id,'createdAt',d.created_at) from public.visit_reward_decisions d where d.request_id=r.id),
 'grant',(select jsonb_build_object('amount',g.amount,'ledgerId',g.ledger_id,'policyVersion',g.policy_snapshot->'version','createdAt',g.created_at) from public.visit_reward_grants g where g.request_id=r.id))
$$;
revoke all on function public.visit_reward_view(public.visit_reward_requests) from public,anon,authenticated;
grant execute on function public.visit_reward_view(public.visit_reward_requests) to service_role;

create function public.visit_reward_action(p_actor uuid,p_action text,p_payload jsonb default '{}'::jsonb,p_issue_enabled boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.visit_reward_requests; d public.visit_reward_decisions; g public.visit_reward_grants; pol public.visit_reward_policy;
 v_role text; t record; v_id uuid; v_amount integer; v_ledger uuid; v_month date:=date_trunc('month',now()at time zone'Asia/Seoul')::date;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor and email_confirmed_at is not null and email is not null and not coalesce(is_anonymous,false)) then raise exception 'Verified email required' using errcode='28000';end if;
 if p_action in ('decide','issue','policy_update','affiliation') then
  -- A global transaction lock deliberately serializes the low-volume pilot's payouts, policy and affiliation changes.
  perform pg_advisory_xact_lock(1702026,71);
 end if;
 select role into v_role from public.user_roles where user_id=p_actor for share;
 if p_action in ('queue','decide','issue') and coalesce(v_role,'traveler') not in ('admin','moderator') then raise exception 'Admin required' using errcode='42501';end if;
 if p_action in ('policy_update','affiliation') and v_role is distinct from 'admin' then raise exception 'Admin required' using errcode='42501';end if;
 select * into pol from public.visit_reward_policy where singleton for share;
 if p_action='policy' then return to_jsonb(pol)||jsonb_build_object('effectiveEnabled',pol.enabled and p_issue_enabled and coalesce((select rewards_enabled from public.lp_policy where singleton),false));end if;
 if p_action='policy_update' then
  if pol.version<>(p_payload->>'expectedVersion')::integer then raise exception 'Policy changed' using errcode='LR409';end if;
  if length(btrim(coalesce(p_payload->>'reason','')))<10 or jsonb_array_length(p_payload->'amounts')<>5 then raise exception 'Invalid policy' using errcode='22023';end if;
  update public.visit_reward_policy set version=version+1,enabled=(p_payload->>'enabled')::boolean,
   amounts=array(select jsonb_array_elements_text(p_payload->'amounts')::integer),place_month_cap=(p_payload->>'placeMonthCap')::integer,curator_month_cap=(p_payload->>'curatorMonthCap')::integer where singleton;
  insert into public.visit_reward_audit(actor_id,action,details) values(p_actor,'policy.updated',jsonb_build_object('previous',to_jsonb(pol),'next',(select to_jsonb(p) from public.visit_reward_policy p where singleton),'reason',p_payload->>'reason'));
  return (select to_jsonb(p) from public.visit_reward_policy p where singleton);
 elsif p_action='affiliation' then
  if length(btrim(coalesce(p_payload->>'reason','')))<10 then raise exception 'Reason required' using errcode='22023';end if;
  insert into public.visit_reward_affiliations(user_id,place_id,kind,active,reason,updated_by) values((p_payload->>'userId')::uuid,(p_payload->>'placeId')::uuid,p_payload->>'kind',(p_payload->>'active')::boolean,p_payload->>'reason',p_actor)
   on conflict(user_id,place_id) do update set kind=excluded.kind,active=excluded.active,reason=excluded.reason,updated_by=p_actor,updated_at=now();
  insert into public.visit_reward_audit(actor_id,action,entity_id,details) values(p_actor,'affiliation.updated',(p_payload->>'placeId')::uuid,p_payload);
  return jsonb_build_object('ok',true);
 elsif p_action='targets' then
  return coalesce((select jsonb_agg(jsonb_build_object('ratingId',x.id,'placeId',e.place_id,'placeName',p.name,'endorsementVersionId',v.id,'versionNumber',v.version,'versionText',v.text,'helpfulness',x.helpfulness,'visitedOn',rv.visited_on))
   from public.endorsement_ratings x join public.place_reviews rv on rv.id=x.review_id join public.endorsement_versions v on v.id=x.endorsement_version_id
   join public.endorsements e on e.id=v.endorsement_id join public.places p on p.id=e.place_id
   where x.user_id=p_actor and rv.user_id=p_actor and rv.place_id=e.place_id and e.user_id<>p_actor and e.active and v.status in ('published','superseded') and p.status='published'),'[]'::jsonb);
 elsif p_action='list' then return coalesce((select jsonb_agg(public.visit_reward_view(q) order by q.created_at desc) from public.visit_reward_requests q where q.user_id=p_actor),'[]'::jsonb);
 elsif p_action='queue' then return coalesce((select jsonb_agg(public.visit_reward_view(q)||jsonb_build_object('knownAffiliations',coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'kind',a.kind)) from public.visit_reward_affiliations a where a.place_id=q.place_id and a.user_id in (q.user_id,q.curator_id) and a.active),'[]'::jsonb)) order by q.created_at) from public.visit_reward_requests q where q.state in ('pending','approved') and not exists(select 1 from public.visit_reward_grants z where z.request_id=q.id)),'[]'::jsonb);
 elsif p_action='submit' then
  perform pg_advisory_xact_lock(hashtextextended('visit-request:'||p_actor::text,0));
  select * into r from public.visit_reward_requests where user_id=p_actor and request_id=(p_payload->>'requestId')::uuid;
  if r.id is not null then
   if r.input<>p_payload then raise exception 'Changed request' using errcode='LR409';end if;
   return public.visit_reward_view(r);
  end if;
  if length(btrim(coalesce(p_payload->>'evidence',''))) not between 10 and 2000 or p_payload->>'consent' is distinct from 'true' or jsonb_typeof(p_payload->'affiliated') is distinct from 'boolean' then raise exception 'Invalid evidence' using errcode='22023';end if;
  select x.id rating_id,x.review_id,x.helpfulness,v.id version_id,v.version,v.text version_text,e.user_id curator_id,e.place_id,rv.visited_on,rv.affiliated
   into t from public.endorsement_ratings x join public.place_reviews rv on rv.id=x.review_id join public.endorsement_versions v on v.id=x.endorsement_version_id
   join public.endorsements e on e.id=v.endorsement_id join public.places p on p.id=e.place_id
   where x.id=(p_payload->>'ratingId')::uuid and x.user_id=p_actor and rv.user_id=p_actor and rv.place_id=e.place_id and e.active and v.status in ('published','superseded') and p.status='published';
  if not found then raise exception 'Attribution not found' using errcode='LR404';end if;
  if t.curator_id=p_actor then raise exception 'Self reward forbidden' using errcode='42501';end if;
  if t.helpfulness<>(p_payload->>'expectedHelpfulness')::integer or t.visited_on<>(p_payload->>'expectedVisitedOn')::date or t.visited_on>(now()at time zone'Asia/Seoul')::date then raise exception 'Feedback changed' using errcode='LR409';end if;
  if (select count(*) from public.visit_reward_requests where user_id=p_actor and created_at>now()-interval '1 day')>=5 then raise exception 'Daily limit' using errcode='LR429';end if;
  insert into public.visit_reward_requests(user_id,request_id,rating_id,review_id,endorsement_version_id,curator_id,place_id,visited_on,helpfulness,version_number,version_text,affiliated,evidence,input)
   values(p_actor,(p_payload->>'requestId')::uuid,t.rating_id,t.review_id,t.version_id,t.curator_id,t.place_id,t.visited_on,t.helpfulness,t.version,t.version_text,t.affiliated or (p_payload->>'affiliated')::boolean,btrim(p_payload->>'evidence'),p_payload) returning * into r;
  insert into public.visit_reward_audit(actor_id,action,entity_id) values(p_actor,'visit.submitted',r.id);
  return public.visit_reward_view(r);
 end if;
 select * into r from public.visit_reward_requests where id=(p_payload->>'id')::uuid for update;
 if r.id is null or (p_action='get' and r.user_id<>p_actor and coalesce(v_role,'traveler') not in ('admin','moderator')) then raise exception 'Not found' using errcode='LR404';end if;
 if p_action='get' then return public.visit_reward_view(r);end if;
 if p_action not in ('decide','issue') then raise exception 'Unknown action' using errcode='22023';end if;
 if p_actor in (r.user_id,r.curator_id) or exists(select 1 from public.visit_reward_affiliations where user_id=p_actor and place_id=r.place_id and active) then raise exception 'Reviewer conflict' using errcode='42501';end if;
 if p_action='decide' then
  select * into d from public.visit_reward_decisions where request_id=r.id;
  if d.id is not null then
   if d.input<>p_payload then raise exception 'Already decided' using errcode='LR409';end if;
   return public.visit_reward_view(r);
  end if;
  if p_payload->>'decision' not in ('approve','reject') or length(btrim(coalesce(p_payload->>'reason',''))) not between 10 and 2000 or length(btrim(coalesce(p_payload->>'evidenceSummary',''))) not between 20 and 2000 then raise exception 'Review evidence required' using errcode='22023';end if;
  if p_payload->>'decision'='approve' and (p_payload->>'independentEvidence' is distinct from 'true' or p_payload->>'affiliationsChecked' is distinct from 'true' or p_payload->>'collusionChecked' is distinct from 'true') then raise exception 'Independent human review required' using errcode='22023';end if;
  insert into public.visit_reward_decisions(request_id,actor_id,client_request_id,decision,reason,evidence_summary,independent_evidence,affiliations_checked,collusion_checked,input)
   values(r.id,p_actor,(p_payload->>'requestId')::uuid,p_payload->>'decision',p_payload->>'reason',p_payload->>'evidenceSummary',coalesce((p_payload->>'independentEvidence')::boolean,false),coalesce((p_payload->>'affiliationsChecked')::boolean,false),coalesce((p_payload->>'collusionChecked')::boolean,false),p_payload);
  update public.visit_reward_requests set state=case when p_payload->>'decision'='approve' then 'approved' else 'rejected' end where id=r.id returning * into r;
  insert into public.visit_reward_audit(actor_id,action,entity_id) values(p_actor,'visit.'||r.state,r.id);
  return public.visit_reward_view(r);
 end if;
 -- Issuance and all eligibility checks are one transaction. A grant replays even if policy later disables payouts.
 select * into g from public.visit_reward_grants where request_id=r.id;
 if g.id is not null then return public.visit_reward_view(r);end if;
 if p_issue_enabled is distinct from true or not pol.enabled or not coalesce((select rewards_enabled from public.lp_policy where singleton for share),false) then raise exception 'Rewards disabled' using errcode='LR503';end if;
 -- Lock the recipient before endorsement/review rows, matching community/planning lock order.
 perform pg_advisory_xact_lock(hashtextextended(r.curator_id::text,0));
 select * into d from public.visit_reward_decisions where request_id=r.id and decision='approve';
 if r.state<>'approved' or d.id is null or not d.independent_evidence or not d.affiliations_checked or not d.collusion_checked then raise exception 'Approval required' using errcode='LR409';end if;
 if not exists(select 1 from public.user_roles where user_id=d.actor_id and role in ('admin','moderator')) or exists(select 1 from public.visit_reward_affiliations where user_id=d.actor_id and place_id=r.place_id and active) then raise exception 'Reviewer no longer independent' using errcode='LR422';end if;
 if r.user_id=r.curator_id or r.affiliated or exists(select 1 from public.visit_reward_affiliations where user_id in (r.user_id,r.curator_id) and place_id=r.place_id and active) then raise exception 'Affiliation ineligible' using errcode='LR422';end if;
 perform 1 from public.endorsement_ratings x join public.place_reviews rv on rv.id=x.review_id join public.endorsement_versions v on v.id=x.endorsement_version_id join public.endorsements e on e.id=v.endorsement_id join public.places p on p.id=e.place_id
   where x.id=r.rating_id and x.user_id=r.user_id and x.review_id=r.review_id and x.endorsement_version_id=r.endorsement_version_id and x.helpfulness=r.helpfulness
   and rv.user_id=r.user_id and rv.place_id=r.place_id and rv.visited_on=r.visited_on and not rv.affiliated and e.user_id=r.curator_id and e.place_id=r.place_id and e.active and v.status in ('published','superseded') and p.status='published' for share of x,rv,v,e,p;
 if not found then raise exception 'Attribution changed' using errcode='LR409';end if;
 if exists(select 1 from public.visit_reward_grants where visitor_id=r.user_id and place_id=r.place_id and visited_on>r.visited_on-90 and visited_on<r.visited_on+90) then raise exception '90 day window' using errcode='LR490';end if;
 v_amount:=pol.amounts[r.helpfulness];
 if v_amount+coalesce((select sum(amount) from public.visit_reward_grants where place_id=r.place_id and cap_month=v_month),0)>pol.place_month_cap then raise exception 'Place cap reached' using errcode='LR491';end if;
 if v_amount+coalesce((select sum(amount) from public.visit_reward_grants where curator_id=r.curator_id and cap_month=v_month),0)>pol.curator_month_cap then raise exception 'Curator cap reached' using errcode='LR492';end if;
 if v_amount>0 then
  insert into public.lp_ledger(user_id,bucket,amount,event_key,reason) values(r.curator_id,'earned',v_amount,'visit-reward:'||r.id::text,'Verified attributable endorsement outcome') returning id into v_ledger;
 end if;
 insert into public.visit_reward_grants(request_id,visitor_id,place_id,curator_id,endorsement_version_id,visited_on,amount,ledger_id,policy_snapshot,cap_month,issued_by)
  values(r.id,r.user_id,r.place_id,r.curator_id,r.endorsement_version_id,r.visited_on,v_amount,v_ledger,to_jsonb(pol),v_month,p_actor);
 insert into public.visit_reward_audit(actor_id,action,entity_id,details) values(p_actor,'reward.issued',r.id,jsonb_build_object('amount',v_amount,'ledgerId',v_ledger,'policyVersion',pol.version));
 return public.visit_reward_view(r);
end;$$;
revoke all on function public.visit_reward_action(uuid,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.visit_reward_action(uuid,text,jsonb,boolean) to service_role;
