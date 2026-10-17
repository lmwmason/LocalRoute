-- Official-source operator facts are distinct from independently authored local
-- endorsements. No author, visit claim, review, photograph or LP is fabricated.
create table public.operator_place_sources (
 source_url text primary key check(length(source_url) between 9 and 2000 and source_url ~ '^https://[^[:space:]/?#@]+([/?][^[:space:]#]*)?$'),
 place_id uuid not null references public.places(id),
 observed_at timestamptz not null,
 facts jsonb not null check(jsonb_typeof(facts)='object'),
 imported_at timestamptz not null default now()
);
create index operator_place_sources_place_idx on public.operator_place_sources(place_id);
alter table public.operator_place_sources enable row level security;
revoke all on public.operator_place_sources from public,anon,authenticated;
grant select on public.operator_place_sources to anon,authenticated;
grant select,insert on public.operator_place_sources to service_role;
create policy operator_sources_published_read on public.operator_place_sources for select to anon,authenticated
 using(exists(select 1 from public.places p where p.id=place_id and p.status='published'));

create function public.import_operator_places(p_entries jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 v_entry jsonb;v_source public.operator_place_sources%rowtype;v_place public.places%rowtype;
 v_id uuid;v_name text;v_address text;v_lat double precision;v_lng double precision;v_observed timestamptz;
 v_exact_count integer;v_action text;v_results jsonb:='[]'::jsonb;
begin
 -- Serialize this bounded operator-only importer across source/identity keys.
 -- Existing contributor flows retain their own separate review/deduplication.
 perform pg_advisory_xact_lock(hashtextextended('localroute.operator_place_catalog',0));
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Invalid catalog batch' using errcode='22023';end if;
 if jsonb_array_length(p_entries) not between 1 and 50 then raise exception 'Invalid catalog batch' using errcode='22023';end if;
 if (select count(distinct value->>'sourceUrl') from jsonb_array_elements(p_entries))<>jsonb_array_length(p_entries) then raise exception 'Duplicate source URL in batch' using errcode='22023';end if;
 for v_entry in select value from jsonb_array_elements(p_entries) loop
  if jsonb_typeof(v_entry) is distinct from 'object' then raise exception 'Invalid catalog entry' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(v_entry)k where k not in('sourceUrl','observedAt','name','address','lat','lng','kind','category')) then raise exception 'Unknown catalog fields' using errcode='22023';end if;
  if jsonb_typeof(v_entry->'sourceUrl') is distinct from 'string'
   or jsonb_typeof(v_entry->'observedAt') is distinct from 'string'
   or jsonb_typeof(v_entry->'name') is distinct from 'string'
   or jsonb_typeof(v_entry->'address') is distinct from 'string'
   or jsonb_typeof(v_entry->'lat') is distinct from 'number'
   or jsonb_typeof(v_entry->'lng') is distinct from 'number'
   or jsonb_typeof(v_entry->'kind') is distinct from 'string'
   or jsonb_typeof(v_entry->'category') is distinct from 'string'
  then raise exception 'Invalid catalog entry' using errcode='22023';end if;
  if length(v_entry->>'sourceUrl') not between 9 and 2000
   or v_entry->>'sourceUrl' !~ '^https://[^[:space:]/?#@]+([/?][^[:space:]#]*)?$'
   or length(btrim(v_entry->>'name')) not between 1 and 100
   or length(btrim(v_entry->>'address')) not between 5 and 250
   or length(btrim(v_entry->>'category')) not between 1 and 50
   or v_entry->>'kind' not in('restaurant','cafe','attraction','culture','experience')
   or (v_entry->>'lat')::numeric not between -90 and 90
   or (v_entry->>'lng')::numeric not between -180 and 180
   or v_entry->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
  then raise exception 'Invalid catalog entry' using errcode='22023';end if;
  begin v_observed:=(v_entry->>'observedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then raise exception 'Invalid observation time' using errcode='22023';end;
  if v_observed>now()+interval'5 minutes' then raise exception 'Observation is in the future' using errcode='22023';end if;
  select * into v_source from public.operator_place_sources where source_url=v_entry->>'sourceUrl';
  if found then
   if v_source.facts is distinct from v_entry then raise exception 'Source facts changed; manual correction required' using errcode='LR409';end if;
   v_results:=v_results||jsonb_build_array(jsonb_build_object('sourceUrl',v_source.source_url,'placeId',v_source.place_id,'action','replayed'));
   continue;
  end if;
  v_name:=lower(regexp_replace(btrim(v_entry->>'name'),'\s+',' ','g'));
  v_address:=lower(regexp_replace(btrim(v_entry->>'address'),'\s+',' ','g'));
  v_lat:=(v_entry->>'lat')::double precision;v_lng:=(v_entry->>'lng')::double precision;
  select count(*) into v_exact_count from public.places p
   where lower(regexp_replace(btrim(p.name),'\s+',' ','g'))=v_name
   and lower(regexp_replace(btrim(p.address),'\s+',' ','g'))=v_address
   and 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(p.lat-v_lat)/2),2)+cos(radians(v_lat))*cos(radians(p.lat))*power(sin(radians(p.lng-v_lng)/2),2))))<=30;
  if v_exact_count>1 then raise exception 'Ambiguous canonical places; manual review required' using errcode='LR409';end if;
  if v_exact_count=1 then
   select * into v_place from public.places p
    where lower(regexp_replace(btrim(p.name),'\s+',' ','g'))=v_name
    and lower(regexp_replace(btrim(p.address),'\s+',' ','g'))=v_address
    and 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(p.lat-v_lat)/2),2)+cos(radians(v_lat))*cos(radians(p.lat))*power(sin(radians(p.lng-v_lng)/2),2))))<=30 for update;
   if v_place.status<>'published' or v_place.kind<>v_entry->>'kind' then raise exception 'Existing place requires manual review' using errcode='LR409';end if;
   v_id:=v_place.id;v_action:='reused';
  else
   if exists(select 1 from public.places p where
     (lower(regexp_replace(btrim(p.name),'\s+',' ','g'))=v_name and lower(regexp_replace(btrim(p.address),'\s+',' ','g'))=v_address)
     or ((lower(regexp_replace(btrim(p.name),'\s+',' ','g'))=v_name or lower(regexp_replace(btrim(p.address),'\s+',' ','g'))=v_address)
     and 6371000*2*asin(least(1::double precision,sqrt(power(sin(radians(p.lat-v_lat)/2),2)+cos(radians(v_lat))*cos(radians(p.lat))*power(sin(radians(p.lng-v_lng)/2),2))))<=150))
   then raise exception 'Uncertain place match; manual review required' using errcode='LR409';end if;
   insert into public.places(name,address,lat,lng,kind,category,status)
    values(btrim(v_entry->>'name'),btrim(v_entry->>'address'),v_lat,v_lng,v_entry->>'kind',btrim(v_entry->>'category'),'published') returning id into v_id;
   v_action:='created';
  end if;
  insert into public.operator_place_sources(source_url,place_id,observed_at,facts)values(v_entry->>'sourceUrl',v_id,v_observed,v_entry);
  insert into public.audit_logs(action,entity_id,details)values('catalog.operator_imported',v_id,jsonb_build_object('sourceUrl',v_entry->>'sourceUrl','kind',v_entry->>'kind','action',v_action));
  v_results:=v_results||jsonb_build_array(jsonb_build_object('sourceUrl',v_entry->>'sourceUrl','placeId',v_id,'action',v_action));
 end loop;
 return v_results;
end;$$;
revoke all on function public.import_operator_places(jsonb)from public,anon,authenticated;
grant execute on function public.import_operator_places(jsonb)to service_role;
