-- Local artifact only. Do not apply remotely without founder approval.
-- Auth identity/confirmed email are verified by the API and independently here.
create table public.legal_consent_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  version text not null check (version = '2026-10-17.1'),
  language text not null check (language in ('ko','en')),
  terms boolean not null check (terms),
  privacy boolean not null check (privacy),
  supabase_transfer boolean not null check (supabase_transfer),
  adult boolean not null check (adult),
  public_local_area boolean not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (user_id, request_id)
);
create index legal_consent_events_user_latest on public.legal_consent_events(user_id, id desc);
alter table public.legal_consent_events enable row level security;
revoke all on public.legal_consent_events from public, anon, authenticated;
grant select on public.legal_consent_events to authenticated;
grant select, insert on public.legal_consent_events to service_role;
grant usage on sequence public.legal_consent_events_id_seq to service_role;
create policy legal_consent_own_read on public.legal_consent_events for select to authenticated
  using (user_id = (select auth.uid()));

-- No role (including the server role) can silently rewrite historical evidence.
-- Account removal/retention is a separately authorized operator procedure.
create function public.legal_consent_no_update() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin raise exception 'Consent evidence is immutable' using errcode = '42501'; end; $$;
revoke all on function public.legal_consent_no_update() from public, anon, authenticated;
create trigger legal_consent_no_update before update on public.legal_consent_events
  for each row execute function public.legal_consent_no_update();

create function public.legal_consent_action(p_actor uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_row public.legal_consent_events; v_request uuid;
begin
  if p_actor is null or not exists (
    select 1 from auth.users where id = p_actor and email is not null
      and email_confirmed_at is not null and coalesce(is_anonymous, false) = false
  ) then raise exception 'Verified email required' using errcode = '28000'; end if;
  if p_action not in ('status', 'record') then raise exception 'Unknown legal action' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text, 197));
  if p_action = 'record' then
    if jsonb_typeof(p_payload) is distinct from 'object'
      or p_payload->>'version' is distinct from '2026-10-17.1'
      or p_payload->>'language' is null or p_payload->>'language' not in ('ko','en')
      or p_payload->'terms' is distinct from 'true'::jsonb
      or p_payload->'privacy' is distinct from 'true'::jsonb
      or p_payload->'supabaseTransfer' is distinct from 'true'::jsonb
      or p_payload->'adult' is distinct from 'true'::jsonb
      or jsonb_typeof(p_payload->'publicLocalArea') is distinct from 'boolean'
      or p_payload->>'requestId' is null
    then raise exception 'Invalid or outdated consent' using errcode = '22023'; end if;
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in
      ('requestId','version','language','terms','privacy','supabaseTransfer','adult','publicLocalArea'))
    then raise exception 'Unknown consent fields' using errcode = '22023'; end if;
    v_request := (p_payload->>'requestId')::uuid;
    select * into v_row from public.legal_consent_events where user_id = p_actor and request_id = v_request;
    if found then
      if v_row.version <> p_payload->>'version' or v_row.language <> p_payload->>'language'
        or v_row.public_local_area <> (p_payload->>'publicLocalArea')::boolean
      then raise exception 'Idempotency conflict' using errcode = 'LR409'; end if;
      -- A replay of an older acceptance must not re-enable withdrawn publication.
    else
      insert into public.legal_consent_events(user_id, request_id, version, language,
        terms, privacy, supabase_transfer, adult, public_local_area)
      values(p_actor, v_request, '2026-10-17.1', p_payload->>'language', true, true, true, true,
        (p_payload->>'publicLocalArea')::boolean);
      update public.profiles set public_local_area = (p_payload->>'publicLocalArea')::boolean where user_id = p_actor;
      update public.curator_identities c set local_area_label = case when p.public_local_area
        then public.locality_label(p.home_city, p.home_area, p.locality_scope) end
        from public.profiles p where p.user_id = p_actor and c.user_id = p_actor;
    end if;
  end if;
  select * into v_row from public.legal_consent_events where user_id = p_actor order by id desc limit 1;
  return jsonb_build_object('current', coalesce(v_row.version = '2026-10-17.1', false),
    'version', v_row.version, 'recordedAt', v_row.recorded_at,
    'publicLocalArea', coalesce(v_row.public_local_area, false));
end; $$;
revoke all on function public.legal_consent_action(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.legal_consent_action(uuid,text,jsonb) to service_role;

-- Legacy onboarding reads user-editable Auth metadata. Such metadata must never
-- publish a home-area label without the separately recorded optional acceptance.
create function public.legal_guard_area_publication() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_allowed boolean;
begin
  select coalesce(e.version = '2026-10-17.1' and e.public_local_area, false)
    into v_allowed from public.legal_consent_events e where e.user_id = new.user_id
    order by e.id desc limit 1;
  if not coalesce(v_allowed, false) then
    if tg_table_name = 'profiles' then new.public_local_area := false;
    else new.local_area_label := null; end if;
  end if;
  return new;
end; $$;
revoke all on function public.legal_guard_area_publication() from public, anon, authenticated;
create trigger legal_guard_profile_publication before insert or update on public.profiles
  for each row execute function public.legal_guard_area_publication();
create trigger legal_guard_curator_publication before insert or update on public.curator_identities
  for each row execute function public.legal_guard_area_publication();
