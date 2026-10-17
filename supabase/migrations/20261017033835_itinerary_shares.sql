create table public.itinerary_shares(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id)on delete cascade,
 itinerary_id uuid not null references public.itineraries(id)on delete cascade,
 revision integer not null check(revision>0),token_hash text not null unique check(token_hash~'^[0-9a-f]{64}$'),
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'and octet_length(snapshot::text)<=262144),
 created_at timestamptz not null default now(),expires_at timestamptz not null,revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval'30 days')
);
create index itinerary_shares_owner_idx on public.itinerary_shares(user_id,created_at);
create index itinerary_shares_plan_idx on public.itinerary_shares(itinerary_id);
alter table public.itinerary_shares enable row level security;
revoke all on public.itinerary_shares from anon,authenticated;
grant select on public.itinerary_shares to authenticated;
grant all on public.itinerary_shares to service_role;
create policy shares_own on public.itinerary_shares for select to authenticated using(user_id=(select auth.uid()));
create function public.itinerary_share_action(p_actor uuid,p_action text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_plan public.itineraries%rowtype;v_share public.itinerary_shares%rowtype;v_expiry timestamptz;
begin
 if p_action='public'then
  select * into v_share from public.itinerary_shares where token_hash=p_payload->>'tokenHash'and revoked_at is null and expires_at>now();
  if not found then raise exception'Share not found'using errcode='LR404';end if;
  return v_share.snapshot;
 end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)then raise exception'User required'using errcode='28000';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 if p_action='revoke'then
  select * into v_share from public.itinerary_shares where id=(p_payload->>'id')::uuid and user_id=p_actor for update;
  if not found then raise exception'Share not found'using errcode='LR404';end if;
  if v_share.revoked_at is null then
   update public.itinerary_shares set revoked_at=now()where id=v_share.id;
   insert into public.audit_logs(actor_id,action,entity_id)values(p_actor,'itinerary.share_revoked',v_share.id);
  end if;
  return jsonb_build_object('ok',true);
 end if;
 select * into v_plan from public.itineraries where id=(p_payload->>'itineraryId')::uuid and user_id=p_actor for share;
 if not found then raise exception'Itinerary not found'using errcode='LR404';end if;
 if p_action='list'then
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'revision',revision,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at)order by created_at desc)from public.itinerary_shares where itinerary_id=v_plan.id and user_id=p_actor),'[]'::jsonb);
 end if;
 if p_action<>'create'then raise exception'Unknown action'using errcode='22023';end if;
 if p_payload->>'consentVersion'is distinct from'unlisted-itinerary-v1'or(p_payload->>'revision')::int is distinct from v_plan.revision then raise exception'Saved revision and consent required'using errcode='LR409';end if;
 if v_plan.result->'evaluation'->>'valid'is distinct from'true'or p_payload->'snapshot'->>'version'is distinct from'1'then raise exception'Valid saved plan required'using errcode='22023';end if;
 if(select count(*)from public.itinerary_shares where user_id=p_actor and created_at>now()-interval'1 day')>=20 then raise exception'Share limit reached'using errcode='LR429';end if;
 v_expiry:=now()+make_interval(days=>least(greatest((p_payload->>'expiresInDays')::int,1),30));
 insert into public.itinerary_shares(user_id,itinerary_id,revision,token_hash,snapshot,expires_at)values(p_actor,v_plan.id,v_plan.revision,p_payload->>'tokenHash',p_payload->'snapshot',v_expiry)returning * into v_share;
 insert into public.audit_logs(actor_id,action,entity_id)values(p_actor,'itinerary.shared',v_share.id);
 return jsonb_build_object('id',v_share.id,'revision',v_share.revision,'createdAt',v_share.created_at,'expiresAt',v_share.expires_at,'revokedAt',v_share.revoked_at);
end;$$;
revoke all on function public.itinerary_share_action(uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.itinerary_share_action(uuid,text,jsonb)to service_role;
