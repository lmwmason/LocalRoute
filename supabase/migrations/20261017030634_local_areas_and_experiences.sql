alter table public.profiles add column home_region text check(char_length(home_region)between 2 and 100);
alter table public.profiles add column public_local_area boolean not null default false;
drop policy profiles_read on public.profiles;
create policy profiles_own on public.profiles for select to authenticated using(user_id=(select auth.uid()));
revoke select on public.profiles from anon;
create table public.curator_identities(user_id uuid primary key references auth.users(id)on delete cascade,display_name text not null,local_area_label text,area_source text not null default 'self_declared'check(area_source='self_declared'));
alter table public.curator_identities enable row level security;
revoke all on public.curator_identities from anon,authenticated;
grant select on public.curator_identities to anon,authenticated;
grant all on public.curator_identities to service_role;
create policy identities_public on public.curator_identities for select to anon,authenticated using(true);
alter table public.places add column kind text not null default 'restaurant'check(kind in ('restaurant','cafe','attraction','culture','experience'));
alter table public.place_submissions add column kind text not null default 'restaurant'check(kind in ('restaurant','cafe','attraction','culture','experience'));
alter function public.submit_contribution(uuid,uuid,uuid,jsonb,text)rename to submit_contribution_v1;
create function public.submit_contribution(p_user_id uuid,p_request_id uuid,p_place_id uuid,p_manual jsonb,p_text text)returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;
begin
 v_result:=public.submit_contribution_v1(p_user_id,p_request_id,p_place_id,p_manual,p_text);
 if p_manual is not null then update public.place_submissions set kind=coalesce(p_manual->>'kind','restaurant')where id=(v_result->>'id')::uuid and user_id=p_user_id;end if;
 return v_result;
end;$$;
revoke all on function public.submit_contribution(uuid,uuid,uuid,jsonb,text)from public,anon,authenticated;
grant execute on function public.submit_contribution(uuid,uuid,uuid,jsonb,text)to service_role;
alter function public.community_action(uuid,text,uuid,jsonb)rename to community_action_v1;
create function public.community_action(p_actor uuid,p_action text,p_request_id uuid,p_payload jsonb)returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;v_region text;v_name text;v_public boolean;v_old public.api_requests%rowtype;
begin
 if p_action in('onboard_profile','profile','workspace')then
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor)then raise exception 'User required'using errcode='28000';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  if p_action='workspace'then
   v_result:=public.community_action_v1(p_actor,p_action,p_request_id,p_payload);
   return v_result||jsonb_build_object('homeRegion',(select home_region from public.profiles where user_id=p_actor),'publicLocalArea',coalesce((select public_local_area from public.profiles where user_id=p_actor),false));
  end if;
  v_region:=nullif(btrim(p_payload->>'homeRegion'),'');v_name:=coalesce(nullif(btrim(p_payload->>'displayName'),''),'Local explorer');v_public:=coalesce((p_payload->>'publicLocalArea')::boolean,false);
  if char_length(v_name)>40 or(v_region is not null and char_length(v_region)not between 2 and 100)then raise exception 'Invalid profile'using errcode='22023';end if;
  if p_action='onboard_profile'then
   insert into public.profiles(user_id,display_name,home_region,public_local_area)values(p_actor,v_name,v_region,v_public)on conflict do nothing;
   insert into public.curator_identities(user_id,display_name,local_area_label)select user_id,display_name,case when public_local_area then home_region end from public.profiles where user_id=p_actor on conflict do nothing;
   return jsonb_build_object('ok',true);
  end if;
  if p_request_id is null then raise exception 'Request required'using errcode='22023';end if;
  select * into v_old from public.api_requests where user_id=p_actor and request_id=p_request_id;
  if found then if v_old.operation<>'profile'or v_old.payload<>p_payload then raise exception 'Idempotency conflict'using errcode='LR409';end if;return v_old.result;end if;
  insert into public.profiles(user_id,display_name,home_region,public_local_area)values(p_actor,v_name,v_region,v_public)on conflict(user_id)do update set display_name=excluded.display_name,home_region=coalesce(excluded.home_region,profiles.home_region),public_local_area=excluded.public_local_area;
  insert into public.curator_identities(user_id,display_name,local_area_label)select user_id,display_name,case when public_local_area then home_region end from public.profiles where user_id=p_actor on conflict(user_id)do update set display_name=excluded.display_name,local_area_label=excluded.local_area_label;
  v_result:=jsonb_build_object('ok',true);insert into public.api_requests(user_id,request_id,operation,payload,result)values(p_actor,p_request_id,'profile',p_payload,v_result);
  insert into public.audit_logs(actor_id,action)values(p_actor,'profile.updated');return v_result;
 end if;
 v_result:=public.community_action_v1(p_actor,p_action,p_request_id,p_payload);
 if p_action='decide'and p_payload->>'kind'='submission'and p_payload->>'decision'='approve'and p_payload->>'placeId' is null then
  update public.places p set kind=s.kind,category=case s.kind when'cafe'then'카페'when'attraction'then'명소'when'culture'then'문화공간'when'experience'then'체험'else p.category end from public.place_submissions s where s.id=(p_payload->>'id')::uuid and p.id=s.resolved_place_id;
 end if;
 return v_result;
end;$$;
revoke all on function public.community_action(uuid,text,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.community_action(uuid,text,uuid,jsonb)to service_role;
