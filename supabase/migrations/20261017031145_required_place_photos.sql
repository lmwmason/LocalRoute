-- Original photographs only. Private Storage objects are never directly exposed.
create table public.place_photos (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 request_id uuid not null,
 target jsonb not null,
 object_path text not null unique,
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 width integer not null check(width between 320 and 1600),
 height integer not null check(height between 320 and 1600),
 state text not null default 'uploading' check(state in('uploading','ready','linked','expired')),
 review text not null default 'pending' check(review in('pending','approved','rejected')),
 source text not null default 'contributor' check(source='contributor'),
 consent_version text not null default 'real-place-photo-v1' check(consent_version='real-place-photo-v1'),
 attachment_id uuid,
 place_id uuid references public.places(id),
 created_at timestamptz not null default now(),
 object_deleted_at timestamptz,
 expires_at timestamptz not null default now()+interval'24 hours',
 unique(user_id,request_id)
);
create index place_photos_place_idx on public.place_photos(place_id)where state='linked' and review='approved';
create index place_photos_expiry_idx on public.place_photos(expires_at)where state in('uploading','ready');
create index place_photos_attachment_idx on public.place_photos(attachment_id);
alter table public.place_photos enable row level security;
revoke all on public.place_photos from anon,authenticated;
grant select on public.place_photos to authenticated;
grant all on public.place_photos to service_role;
create policy photos_own on public.place_photos for select to authenticated using(user_id=(select auth.uid()));

-- The storage schema exists on Supabase, but not in the disposable SQL test harness.
do $$begin
 if to_regclass('storage.buckets')is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('place-photos','place-photos',false,5242880,array['image/jpeg'])
   on conflict(id)do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
  -- Restrictive policy also protects against broader application policies in this project.
  create policy place_photos_server_only on storage.objects as restrictive for all to anon,authenticated
   using(bucket_id<>'place-photos')with check(bucket_id<>'place-photos');
 end if;
end$$;

create function public.register_place_photo(p_actor uuid,p_request_id uuid,p_target jsonb,p_sha256 text,p_width integer,p_height integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_photo public.place_photos%rowtype;
begin
 if p_actor is null or p_request_id is null or not exists(select 1 from auth.users where id=p_actor)then raise exception'User required'using errcode='28000';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 select * into v_photo from public.place_photos where user_id=p_actor and request_id=p_request_id;
 if found then
  if v_photo.target<>p_target or v_photo.sha256<>p_sha256 then raise exception'Photo request changed'using errcode='LR409';end if;
  if v_photo.state='expired'or(v_photo.state<>'linked'and v_photo.expires_at<=now())then raise exception'Photo expired'using errcode='LR410';end if;
  return to_jsonb(v_photo);
 end if;
 if(select count(*)from public.place_photos where user_id=p_actor and created_at>now()-interval'1 day')>=20 then raise exception'Photo rate exceeded'using errcode='LR429';end if;
 if p_target is null or jsonb_typeof(p_target)<>'object'or num_nonnulls(p_target->'placeId',p_target->'manualPlace',p_target->'provider')<>1 then raise exception'Place required'using errcode='22023';end if;
 insert into public.place_photos(user_id,request_id,target,object_path,sha256,width,height)
  values(p_actor,p_request_id,p_target,p_actor::text||'/'||p_request_id::text||'.jpg',p_sha256,p_width,p_height)returning * into v_photo;
 return to_jsonb(v_photo);
end;$$;
revoke all on function public.register_place_photo(uuid,uuid,jsonb,text,integer,integer)from public,anon,authenticated;
grant execute on function public.register_place_photo(uuid,uuid,jsonb,text,integer,integer)to service_role;

-- Linking and creating the contribution commit together. Retries cannot attach a
-- different photo, another user's photo, or a photograph uploaded for another place.
create function public.submit_photographed_contribution(p_actor uuid,p_request_id uuid,p_payload jsonb,p_provider jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_photo public.place_photos%rowtype;v_target jsonb;v_result jsonb;v_place uuid;
begin
 if p_actor is null or p_request_id is null then raise exception'User required'using errcode='28000';end if;
 if not exists(select 1 from public.profiles where user_id=p_actor and home_region is not null)then raise exception'Home region required'using errcode='LR422';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 v_target:=case when p_provider is not null then jsonb_build_object('provider',jsonb_build_object('id',p_provider->>'id'))
  when p_payload->>'placeId'is not null then jsonb_build_object('placeId',p_payload->>'placeId')else jsonb_build_object('manualPlace',p_payload->'manualPlace')end;
 select * into v_photo from public.place_photos where id=(p_payload->>'photoId')::uuid and user_id=p_actor and request_id=p_request_id for update;
 if not found or v_photo.state not in('ready','linked')or v_photo.target<>v_target or(v_photo.state='ready'and v_photo.expires_at<=now())then raise exception'Valid place photograph required'using errcode='22023';end if;
 if p_provider is not null then
  v_result:=public.submit_provider_contribution(p_actor,p_request_id,p_provider,p_payload->>'text');
 else
  v_result:=public.submit_contribution(p_actor,p_request_id,(p_payload->>'placeId')::uuid,p_payload->'manualPlace',p_payload->>'text');
 end if;
 if v_photo.state='linked'and v_photo.attachment_id<>(v_result->>'id')::uuid then raise exception'Already attached'using errcode='LR409';end if;
 select place_id into v_place from public.endorsements where id=(v_result->>'id')::uuid;
 update public.place_photos set state='linked',attachment_id=(v_result->>'id')::uuid,place_id=v_place where id=v_photo.id;
 return v_result;
end;$$;
revoke all on function public.submit_photographed_contribution(uuid,uuid,jsonb,jsonb)from public,anon,authenticated;
grant execute on function public.submit_photographed_contribution(uuid,uuid,jsonb,jsonb)to service_role;

alter function public.community_action(uuid,text,uuid,jsonb)rename to community_action_v2;
create function public.community_action(p_actor uuid,p_action text,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;v_old public.api_requests%rowtype;v_photo public.place_photos%rowtype;
begin
 if p_action in('queue','decide')and not exists(select 1 from public.user_roles where user_id=p_actor and role in('moderator','admin'))then raise exception'Moderator required'using errcode='42501';end if;
 if p_action='decide'and p_payload->>'kind'='photo'then
  if not exists(select 1 from public.user_roles where user_id=p_actor and role in('moderator','admin'))then raise exception'Moderator required'using errcode='42501';end if;
  if p_request_id is null or p_payload->>'decision'not in('approve','reject')or char_length(btrim(p_payload->>'reason'))not between 5 and 1000 or p_payload->>'reason'is null then raise exception'Reason required'using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select * into v_old from public.api_requests where user_id=p_actor and request_id=p_request_id;
  if found then if v_old.operation<>'decide'or v_old.payload<>p_payload then raise exception'Idempotency conflict'using errcode='LR409';end if;return v_old.result;end if;
  select * into v_photo from public.place_photos where id=(p_payload->>'id')::uuid and state='linked'and review='pending'for update;
  if not found then raise exception'Already reviewed or missing'using errcode='LR409';end if;
  update public.place_photos set review=case p_payload->>'decision'when'approve'then'approved'else'rejected'end where id=v_photo.id;
  insert into public.moderation_decisions(actor_id,entity_kind,entity_id,decision,reason)values(p_actor,'photo',v_photo.id,p_payload->>'decision',p_payload->>'reason');
  v_result:=jsonb_build_object('id',v_photo.id,'reviewed',true);
  insert into public.api_requests(user_id,request_id,operation,payload,result)values(p_actor,p_request_id,'decide',p_payload,v_result);
  insert into public.audit_logs(actor_id,action,entity_id,details)values(p_actor,'photo.reviewed',v_photo.id,jsonb_build_object('decision',p_payload->>'decision','reason',p_payload->>'reason'));
  return v_result;
 end if;
 if p_action='decide'and p_payload->>'decision'='approve'and p_payload->>'kind'in('submission','endorsement','place')then
  -- Legacy records remain editable. New photographed submissions need an explicit
  -- human photo review before their recommendation/place can be published.
  if exists(select 1 from public.place_photos ph where ph.state='linked'and ph.review<>'approved'and (
   (p_payload->>'kind'='submission'and ph.attachment_id=(p_payload->>'id')::uuid)or
   (p_payload->>'kind'='endorsement'and ph.attachment_id=(select endorsement_id from public.endorsement_versions where id=(p_payload->>'id')::uuid))or
   (p_payload->>'kind'='place'and ph.place_id=(p_payload->>'id')::uuid)))then raise exception'Review place photograph first'using errcode='LR409';end if;
 end if;
 v_result:=public.community_action_v2(p_actor,p_action,p_request_id,p_payload);
 if p_action='queue'then
  return jsonb_set(v_result,'{queue}',coalesce(v_result->'queue','[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind','photo','title','장소 사진 검토','body','실제 장소와 일치 여부, 촬영 권리와 개인정보 노출을 확인하세요.','status','pending','createdAt',created_at,'userId',user_id,'placeId',place_id))from public.place_photos where state='linked'and review='pending'),'[]'::jsonb));
 end if;
 if p_action='decide'and p_payload->>'kind'='submission'and p_payload->>'decision'='approve'then
  update public.place_photos ph set place_id=s.resolved_place_id from public.place_submissions s where s.id=(p_payload->>'id')::uuid and ph.attachment_id=s.id;
 end if;
 return v_result;
end;$$;
revoke all on function public.community_action(uuid,text,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.community_action(uuid,text,uuid,jsonb)to service_role;

-- Run with the server-only cleanup script on a schedule. Claim expiration before
-- deleting an object so it cannot concurrently become a submitted photograph.
create function public.expire_place_photos(p_limit integer default 100)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_ids uuid[];
begin
 select array_agg(id)into v_ids from(select id from public.place_photos
  where object_deleted_at is null and(state='expired'or(state in('uploading','ready')and expires_at<=now())or(state='linked'and review='rejected'and created_at<now()-interval'30 days'))
  order by created_at limit least(greatest(p_limit,1),100)for update skip locked)q;
 update public.place_photos set state='expired'where id=any(v_ids);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'path',object_path))from public.place_photos where id=any(v_ids)),'[]'::jsonb);
end;$$;
revoke all on function public.expire_place_photos(integer)from public,anon,authenticated;
grant execute on function public.expire_place_photos(integer)to service_role;
