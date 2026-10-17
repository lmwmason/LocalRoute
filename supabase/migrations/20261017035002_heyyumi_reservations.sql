-- Private customer snapshots. No LP, visit-verification or Auth metadata writes.
create table public.reservations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, fingerprint text not null check(length(fingerprint)=64),
 place_id uuid not null references public.places(id), external_id text not null,
 reservation_time timestamptz not null, guest_count integer not null check(guest_count between 1 and 100),
 guest_name text, guest_phone text, note text,
 consent_version text not null check(consent_version='heyyumi-reservation-v1'), consented_at timestamptz not null default now(),
 state text not null default 'submitting' check(state in ('draft','submitting','pending','confirmed','declined','cancelled','expired','failed','unknown','no_show')),
 provider_reference text unique, expires_at timestamptz,
 reconciliation_required boolean not null default false,
 revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(user_id,request_id)
);
-- Different request keys cannot bypass duplicate protection, even with changed party size/contact.
create unique index reservations_active_slot on public.reservations(user_id,place_id,reservation_time)
 where state in ('submitting','pending','confirmed','unknown');
create index reservations_user_created on public.reservations(user_id,created_at);
create table public.reservation_status_events (
 id uuid primary key default gen_random_uuid(), reservation_id uuid not null references public.reservations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 state text not null, provider_status text check(length(provider_status)<=64), revision integer not null, created_at timestamptz not null default now(),
 unique(reservation_id,revision)
);
create index reservation_events_user on public.reservation_status_events(user_id,reservation_id);
alter table public.reservations enable row level security;
alter table public.reservation_status_events enable row level security;
revoke all on public.reservations,public.reservation_status_events from public,anon,authenticated;
grant select on public.reservations,public.reservation_status_events to authenticated;
grant all on public.reservations,public.reservation_status_events to service_role;
create policy reservations_own on public.reservations for select to authenticated using(user_id=(select auth.uid()));
create policy reservation_events_own on public.reservation_status_events for select to authenticated using(user_id=(select auth.uid()));

-- Service-role only; caller supplies actor from server-verified, confirmed-email getUser.
create function public.reservation_action(p_actor uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.reservations; v_external text; v_state text; v_ref text;
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'User required' using errcode='28000'; end if;
 if p_action='profile' then
  return (select jsonb_build_object('guestName',guest_name,'guestPhone',guest_phone) from public.booking_profiles where user_id=p_actor);
 elsif p_action='venue' then
  return (select jsonb_build_object('externalId',e.external_id) from public.place_external_ids e join public.places p on p.id=e.place_id
   where p.id=(p_payload->>'placeId')::uuid and p.status='published' and e.provider='heyyumi' limit 1);
 elsif p_action='lookup' then
  select * into r from public.reservations where user_id=p_actor and request_id=(p_payload->>'requestId')::uuid;
  if r.id is null then return null; end if;
  return to_jsonb(r);
 elsif p_action='redact' then
  -- Caller schedules this server-only maintenance action for each user. Status history contains no contact data.
  update public.reservations set guest_name=null,guest_phone=null,note=null
   where user_id=p_actor and reservation_time<now()-interval '30 days';
  return jsonb_build_object('ok',true);
 elsif p_action='read' then
  select * into r from public.reservations where user_id=p_actor and id=(p_payload->>'id')::uuid;
  if r.id is null then raise exception 'Not found' using errcode='LR404'; end if;
  return to_jsonb(r);
 elsif p_action='claim' then
  perform pg_advisory_xact_lock(hashtextextended('reservation:'||p_actor::text,0));
  select * into r from public.reservations where user_id=p_actor and request_id=(p_payload->>'requestId')::uuid;
  if r.id is not null then
   if r.fingerprint is distinct from p_payload->>'fingerprint' then raise exception 'Changed request' using errcode='LR409'; end if;
   return jsonb_build_object('created',false,'reservation',to_jsonb(r));
  end if;
  if p_payload->>'consentVersion' is distinct from 'heyyumi-reservation-v1' or p_payload->>'consent' is distinct from 'true'
   or (p_payload->>'reservationTime')::timestamptz<=now()
   or coalesce(p_payload->>'guestPhone','') !~ '^\+?[0-9]{7,15}$'
   or length(coalesce(p_payload->>'guestName','')) not between 1 and 80
   or length(coalesce(p_payload->>'note',''))>500 then raise exception 'Invalid reservation' using errcode='22023'; end if;
  select e.external_id into v_external from public.place_external_ids e join public.places p on p.id=e.place_id
   where p.id=(p_payload->>'placeId')::uuid and p.status='published' and e.provider='heyyumi' and e.external_id=p_payload->>'externalId';
  if v_external is null then raise exception 'Not found' using errcode='LR404'; end if;
  if exists(select 1 from public.reservations where user_id=p_actor and place_id=(p_payload->>'placeId')::uuid
   and reservation_time=(p_payload->>'reservationTime')::timestamptz and state in ('submitting','pending','confirmed','unknown')) then
   raise exception 'Duplicate reservation' using errcode='LR409'; end if;
  if (select count(*) from public.reservations where user_id=p_actor and created_at>now()-interval '1 hour')>=5 then raise exception 'Rate limit' using errcode='LR429'; end if;
  insert into public.reservations(user_id,request_id,fingerprint,place_id,external_id,reservation_time,guest_count,guest_name,guest_phone,note,consent_version)
   values(p_actor,(p_payload->>'requestId')::uuid,p_payload->>'fingerprint',(p_payload->>'placeId')::uuid,v_external,(p_payload->>'reservationTime')::timestamptz,
    (p_payload->>'guestCount')::integer,p_payload->>'guestName',p_payload->>'guestPhone',p_payload->>'note',p_payload->>'consentVersion') returning * into r;
  insert into public.reservation_status_events(reservation_id,user_id,state,revision) values(r.id,p_actor,r.state,r.revision);
  return jsonb_build_object('created',true,'reservation',to_jsonb(r));
 elsif p_action='settle' then
  select * into r from public.reservations where user_id=p_actor and id=(p_payload->>'id')::uuid for update;
  if r.id is null then raise exception 'Not found' using errcode='LR404'; end if;
  -- Compare-and-swap prevents stale polls from overwriting a newer response.
  if r.revision<>(p_payload->>'revision')::integer then return to_jsonb(r); end if;
  v_state:=p_payload->>'state'; v_ref:=coalesce(r.provider_reference,p_payload->>'reference');
  if not (v_state=r.state or (r.state in ('submitting','pending','unknown') and v_state in ('pending','confirmed','declined','expired','failed','unknown','no_show'))
   or (r.state='confirmed' and v_state in ('declined','no_show'))) then
   v_state:=r.state; p_payload:=jsonb_set(p_payload,'{reconciliationRequired}','true');
  end if;
  update public.reservations set state=v_state,provider_reference=v_ref,
   expires_at=coalesce((p_payload->>'expiresAt')::timestamptz,expires_at),
   reconciliation_required=coalesce((p_payload->>'reconciliationRequired')::boolean,false),revision=revision+1,updated_at=now()
   where id=r.id returning * into r;
  insert into public.reservation_status_events(reservation_id,user_id,state,provider_status,revision) values(r.id,p_actor,r.state,p_payload->>'providerStatus',r.revision);
  return to_jsonb(r);
 else raise exception 'Unsupported action' using errcode='22023'; end if;
end; $$;
revoke all on function public.reservation_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reservation_action(uuid,text,jsonb) to service_role;
