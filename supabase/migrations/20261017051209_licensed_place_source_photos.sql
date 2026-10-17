-- Operator-reviewed licensed photographs are separate from contributor uploads.
create table public.place_source_photos (
 id uuid primary key default gen_random_uuid(),
 place_id uuid not null references public.places(id) on delete cascade,
 asset_path text not null check(asset_path ~ '^/place-source-photos/[a-z0-9][a-z0-9_-]{0,159}\.(jpg|jpeg|png|webp)$'),
 source_page_url text not null check(length(source_page_url)<=2000 and source_page_url ~ '^https://[^[:space:]/?#@]+([/?][^[:space:]#]*)?$'),
 author text not null check(length(btrim(author)) between 1 and 300),
 license text not null check(license in('CC BY-SA 2.0','CC BY-SA 3.0','CC BY-SA 4.0','CC BY 2.0','CC BY 3.0','CC BY 4.0','CC0','Public Domain','KOGL Type 1')),
 license_url text not null,
 title text not null check(length(btrim(title)) between 1 and 300),
 caption text not null check(length(btrim(caption)) between 1 and 700),
 captured_at text check(captured_at is null or length(captured_at) between 1 and 80),
 changes text not null check(length(btrim(changes)) between 1 and 700),
 prior_changes text check(prior_changes is null or length(prior_changes)<=1200),
 verified_at timestamptz not null check(verified_at<=now()+interval'5 minutes'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 manifest jsonb not null check(jsonb_typeof(manifest)='object'),
 unique(place_id,asset_path),
 check(license_url=case license
  when 'CC BY-SA 2.0' then 'https://creativecommons.org/licenses/by-sa/2.0/'
  when 'CC BY-SA 3.0' then 'https://creativecommons.org/licenses/by-sa/3.0/'
  when 'CC BY-SA 4.0' then 'https://creativecommons.org/licenses/by-sa/4.0/'
  when 'CC BY 2.0' then 'https://creativecommons.org/licenses/by/2.0/'
  when 'CC BY 3.0' then 'https://creativecommons.org/licenses/by/3.0/'
  when 'CC BY 4.0' then 'https://creativecommons.org/licenses/by/4.0/'
  when 'CC0' then 'https://creativecommons.org/publicdomain/zero/1.0/'
  when 'Public Domain' then 'https://creativecommons.org/publicdomain/mark/1.0/'
  when 'KOGL Type 1' then 'https://www.kogl.or.kr/info/licenseType1.do'
  else '' end)
);
alter table public.place_source_photos enable row level security;
revoke all on public.place_source_photos from public,anon,authenticated;
grant select on public.place_source_photos to anon,authenticated;
grant select,insert on public.place_source_photos to service_role;
create policy source_photos_published_read on public.place_source_photos for select to anon,authenticated
 using(exists(select 1 from public.places p where p.id=place_id and p.status='published'));

create function public.import_place_source_photos(p_entries jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_entry jsonb;v_place uuid;v_photo public.place_source_photos%rowtype;v_results jsonb:='[]';v_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('localroute.place_source_photos',0));
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Invalid photo batch' using errcode='22023';end if;
 if jsonb_array_length(p_entries) not between 1 and 50 then raise exception 'Invalid photo batch' using errcode='22023';end if;
 for v_entry in select value from jsonb_array_elements(p_entries) loop
  if jsonb_typeof(v_entry) is distinct from 'object' then raise exception 'Invalid photo entry' using errcode='22023';end if;
  if exists(select 1 from jsonb_object_keys(v_entry)k where k not in('placeId','placeSourceUrl','assetPath','sourcePageUrl','author','license','licenseUrl','title','caption','capturedAt','changes','priorChanges','verifiedAt','sha256')) then raise exception 'Unknown photo fields' using errcode='22023';end if;
  if exists(select 1 from unnest(array['assetPath','sourcePageUrl','author','license','licenseUrl','title','caption','changes','verifiedAt','sha256'])k where jsonb_typeof(v_entry->k) is distinct from 'string') then raise exception 'Photo source fields are required' using errcode='22023';end if;
  if ((v_entry->>'placeId') is not null)::integer+((v_entry->>'placeSourceUrl') is not null)::integer<>1 then raise exception 'Select one place identity' using errcode='22023';end if;
  if v_entry->>'placeId' is not null then
   v_place:=(v_entry->>'placeId')::uuid;
  else
   select place_id into v_place from public.operator_place_sources where source_url=v_entry->>'placeSourceUrl';
  end if;
  if v_place is null or not exists(select 1 from public.places where id=v_place and status='published') then raise exception 'Published source place not found' using errcode='LR404';end if;
  select * into v_photo from public.place_source_photos where place_id=v_place and asset_path=v_entry->>'assetPath';
  if found then
   if v_photo.manifest is distinct from v_entry then raise exception 'Photo metadata changed; manual review required' using errcode='LR409';end if;
   v_results:=v_results||jsonb_build_array(jsonb_build_object('id',v_photo.id,'placeId',v_place,'assetPath',v_photo.asset_path,'action','replayed'));
   continue;
  end if;
  insert into public.place_source_photos(place_id,asset_path,source_page_url,author,license,license_url,title,caption,captured_at,changes,prior_changes,verified_at,sha256,manifest)
   values(v_place,v_entry->>'assetPath',v_entry->>'sourcePageUrl',v_entry->>'author',v_entry->>'license',v_entry->>'licenseUrl',v_entry->>'title',v_entry->>'caption',v_entry->>'capturedAt',v_entry->>'changes',v_entry->>'priorChanges',(v_entry->>'verifiedAt')::timestamptz,v_entry->>'sha256',v_entry) returning id into v_id;
  v_results:=v_results||jsonb_build_array(jsonb_build_object('id',v_id,'placeId',v_place,'assetPath',v_entry->>'assetPath','action','created'));
 end loop;
 return v_results;
end;$$;
revoke all on function public.import_place_source_photos(jsonb) from public,anon,authenticated;
grant execute on function public.import_place_source_photos(jsonb) to service_role;
