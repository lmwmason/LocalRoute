-- Local-only migration until explicitly approved for the hosted project.
-- All writes go through server-authorized service-role RPCs. Public clients only read under RLS.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('traveler','moderator','admin')) default 'traveler'
);
create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  address text not null check (char_length(btrim(address)) between 5 and 250),
  category text not null default '식당',
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  status text not null default 'pending' check (status in ('pending','published','rejected','merged')),
  created_at timestamptz not null default now()
);
create index places_status_idx on public.places(status);
create table public.place_external_ids (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id),
  provider text not null check (provider in ('heyyumi','kakao')),
  external_id text not null check (char_length(external_id) between 1 and 200),
  synced_at timestamptz not null default now(),
  confidence double precision check (confidence between 0 and 1),
  observed_at timestamptz,
  possibly_closed boolean not null default false,
  unique(provider,external_id)
);
create index place_external_ids_place_idx on public.place_external_ids(place_id);
create table public.endorsements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  place_id uuid not null references public.places(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index endorsements_active_unique on public.endorsements(user_id,place_id) where active;
create index endorsements_place_idx on public.endorsements(place_id);
create table public.endorsement_versions (
  id uuid primary key default gen_random_uuid(),
  endorsement_id uuid not null references public.endorsements(id),
  version integer not null check (version > 0),
  text text not null check (char_length(btrim(text)) between 5 and 200),
  status text not null default 'pending' check (status in ('pending','published','rejected','superseded')),
  created_at timestamptz not null default now(),
  unique(endorsement_id,version)
);
alter table public.endorsement_versions add constraint version_endorsement_pair unique(endorsement_id,id);
alter table public.endorsements add column published_version_id uuid;
alter table public.endorsements add constraint published_version_parent foreign key(id,published_version_id) references public.endorsement_versions(endorsement_id,id);
create unique index endorsement_one_published on public.endorsement_versions(endorsement_id) where status = 'published';
create table public.place_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  address text not null check (char_length(btrim(address)) between 5 and 250),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  endorsement_text text not null check (char_length(btrim(endorsement_text)) between 5 and 200),
  status text not null default 'pending' check (status in ('pending','published','rejected')),
  resolved_place_id uuid references public.places(id),
  created_at timestamptz not null default now()
);
create index place_submissions_user_idx on public.place_submissions(user_id,created_at);
create table public.api_requests (
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  operation text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
create index api_requests_rate_idx on public.api_requests(user_id,created_at);
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.places enable row level security;
alter table public.place_external_ids enable row level security;
alter table public.endorsements enable row level security;
alter table public.endorsement_versions enable row level security;
alter table public.place_submissions enable row level security;
alter table public.api_requests enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.profiles,public.user_roles,public.places,public.place_external_ids,public.endorsements,public.endorsement_versions,public.place_submissions,public.api_requests,public.audit_logs from anon,authenticated;
grant select on public.profiles,public.places,public.place_external_ids,public.endorsements,public.endorsement_versions to anon,authenticated;
grant select on public.user_roles,public.place_submissions,public.api_requests to authenticated;
grant all on public.profiles,public.user_roles,public.places,public.place_external_ids,public.endorsements,public.endorsement_versions,public.place_submissions,public.api_requests,public.audit_logs to service_role;
grant usage,select on sequence public.audit_logs_id_seq to service_role;

create policy profiles_read on public.profiles for select to anon,authenticated using (true);
create policy roles_own on public.user_roles for select to authenticated using (user_id = (select auth.uid()));
create policy places_read on public.places for select to anon,authenticated using (status = 'published');
create policy external_ids_read on public.place_external_ids for select to anon,authenticated using (exists (select 1 from public.places p where p.id = place_id and p.status = 'published'));
create policy endorsements_read on public.endorsements for select to anon,authenticated using (
  user_id = (select auth.uid()) or (active and published_version_id is not null and exists (select 1 from public.places p where p.id = place_id and p.status = 'published'))
);
-- The parent policy uses a publication pointer, so this lookup does not recurse.
create policy versions_read on public.endorsement_versions for select to anon,authenticated using (
  status = 'published' and exists (
    select 1 from public.endorsements e join public.places p on p.id=e.place_id
    where e.id=endorsement_id and e.published_version_id=endorsement_versions.id and e.active and p.status='published'
  )
);
create policy submissions_own on public.place_submissions for select to authenticated using (user_id = (select auth.uid()));
create policy requests_own on public.api_requests for select to authenticated using (user_id = (select auth.uid()));

create function public.submit_contribution(p_user_id uuid,p_request_id uuid,p_place_id uuid,p_manual jsonb,p_text text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_payload jsonb := jsonb_build_object('placeId',p_place_id,'manual',p_manual,'text',btrim(p_text));
  v_old public.api_requests%rowtype;
  v_id uuid;
  v_result jsonb;
begin
  if p_user_id is null or p_request_id is null or not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'User required' using errcode='28000';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into v_old from public.api_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_old.operation <> 'contribution' or v_old.payload <> v_payload then raise exception 'Idempotency conflict' using errcode='LR409'; end if;
    return v_old.result;
  end if;
  if (select count(*) from public.api_requests where user_id=p_user_id and created_at > now()-interval '1 minute') >= 10 then
    raise exception 'Submission rate exceeded' using errcode='LR429';
  end if;
  if char_length(btrim(p_text)) not between 5 and 200 or p_text is null or (p_place_id is null) = (p_manual is null) then
    raise exception 'Invalid contribution' using errcode='22023';
  end if;
  if p_place_id is not null then
    if not exists(select 1 from public.places where id=p_place_id and status='published') then raise exception 'Place not found' using errcode='LR404'; end if;
    insert into public.endorsements(user_id,place_id) values(p_user_id,p_place_id) returning id into v_id;
    insert into public.endorsement_versions(endorsement_id,version,text) values(v_id,1,btrim(p_text));
  else
    insert into public.place_submissions(user_id,name,address,lat,lng,endorsement_text)
      values(p_user_id,btrim(p_manual->>'name'),btrim(p_manual->>'address'),(p_manual->>'lat')::double precision,(p_manual->>'lng')::double precision,btrim(p_text)) returning id into v_id;
  end if;
  v_result := jsonb_build_object('id',v_id,'status','pending');
  insert into public.api_requests(user_id,request_id,operation,payload,result) values(p_user_id,p_request_id,'contribution',v_payload,v_result);
  insert into public.audit_logs(actor_id,action,entity_id) values(p_user_id,'contribution.submitted',v_id);
  return v_result;
end;
$$;
revoke all on function public.submit_contribution(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_contribution(uuid,uuid,uuid,jsonb,text) to service_role;
