alter table public.profiles add column home_city text check(char_length(home_city)between 2 and 80);
alter table public.profiles add column home_area text check(char_length(home_area)<=80);
alter table public.profiles add column locality_scope text not null default'auto'check(locality_scope in('auto','city','area'));

create function public.locality_label(p_city text,p_area text,p_scope text)returns text
language sql immutable security invoker set search_path='' as $$
 select concat_ws(' ',p_city,case when p_scope='area'or(p_scope='auto'and p_city=any(array['서울','서울시','서울특별시','부산','부산시','부산광역시','인천','인천시','인천광역시','대구','대구시','대구광역시','대전','대전시','대전광역시','광주','광주시','광주광역시','울산','울산시','울산광역시'])and p_area ~ '구$')then nullif(p_area,'')end)
$$;
revoke all on function public.locality_label(text,text,text)from public;
grant execute on function public.locality_label(text,text,text)to service_role;

alter function public.community_action(uuid,text,uuid,jsonb)rename to community_action_v3;
create function public.community_action(p_actor uuid,p_action text,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_city text:=nullif(btrim(p_payload->>'homeCity'),'');v_area text:=coalesce(btrim(p_payload->>'homeArea'),'');v_scope text:=coalesce(p_payload->>'localityScope','auto');v_result jsonb;v_replay boolean;v_existing boolean;
begin
 if p_action='locality_counts'then
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor)then raise exception'User required'using errcode='28000';end if;
  return(select jsonb_build_object('city',count(*),'area',count(*)filter(where home.home_area<>''and strpos(' '||lower(p.address)||' ',' '||lower(home.home_area)||' ')>0))
   from public.places p join public.profiles home on home.user_id=p_actor
   where p.status='published'and p.kind='restaurant'and home.home_city is not null
   and strpos(' '||regexp_replace(lower(p.address),'(특별시|광역시|시)(\s|$)','\2','g')||' ',' '||regexp_replace(lower(home.home_city),'(특별시|광역시|시)$','')||' ')>0);
 end if;
 if p_action in('profile','onboard_profile')and v_city is not null then
  if char_length(v_city)not between 2 and 80 or char_length(v_area)>80 or char_length(concat_ws(' ',v_city,nullif(v_area,'')))>100 or v_scope not in('auto','city','area')or(v_scope='area'and v_area='')or v_city~'[[:cntrl:]]'or v_area~'[[:cntrl:]]'then raise exception'Invalid locality'using errcode='22023';end if;
  if p_actor is null then raise exception'User required'using errcode='28000';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  v_replay:=exists(select 1 from public.api_requests where user_id=p_actor and request_id=p_request_id);
  v_existing:=exists(select 1 from public.profiles where user_id=p_actor and home_city is not null);
  p_payload:=p_payload||jsonb_build_object('homeRegion',concat_ws(' ',v_city,nullif(v_area,'')));
  v_result:=public.community_action_v3(p_actor,p_action,p_request_id,p_payload);
  if not v_replay and(p_action='profile'or not v_existing)then
   update public.profiles set home_city=v_city,home_area=v_area,locality_scope=v_scope where user_id=p_actor;
   update public.curator_identities c set local_area_label=case when p.public_local_area then public.locality_label(p.home_city,p.home_area,p.locality_scope)end from public.profiles p where p.user_id=p_actor and c.user_id=p.user_id;
  end if;
  return v_result;
 end if;
 v_result:=public.community_action_v3(p_actor,p_action,p_request_id,p_payload);
 if p_action='workspace'then
  return v_result||coalesce((select jsonb_build_object('homeCity',home_city,'homeArea',home_area,'localityScope',locality_scope)from public.profiles where user_id=p_actor),'{}'::jsonb);
 end if;
 return v_result;
end;$$;
revoke all on function public.community_action(uuid,text,uuid,jsonb)from public,anon,authenticated;
grant execute on function public.community_action(uuid,text,uuid,jsonb)to service_role;
