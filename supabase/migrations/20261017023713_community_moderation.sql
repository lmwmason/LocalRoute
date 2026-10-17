create table public.place_reviews (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),place_id uuid not null references public.places(id),
  rating smallint not null check(rating between 1 and 5),text text not null default '' check(char_length(text)<=1000),
  visited_on date not null,affiliated boolean not null default false,
  verification_state text not null default 'unverified' check(verification_state in ('unverified','verified','rejected')),
  created_at timestamptz not null default now(),unique(user_id,place_id)
);
create index place_reviews_place_idx on public.place_reviews(place_id);
create table public.endorsement_ratings (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
  endorsement_version_id uuid not null references public.endorsement_versions(id),review_id uuid not null references public.place_reviews(id),
  helpfulness smallint not null check(helpfulness between 1 and 5),created_at timestamptz not null default now(),unique(user_id,endorsement_version_id)
);
create index endorsement_ratings_version_idx on public.endorsement_ratings(endorsement_version_id);
create index endorsement_ratings_review_idx on public.endorsement_ratings(review_id);
create table public.owner_correction_requests (
  id uuid primary key default gen_random_uuid(),request_id uuid not null unique,place_id uuid not null references public.places(id),
  field text not null check(field in ('name','address','hours','menu','other')),value text not null check(char_length(value) between 2 and 1000),
  evidence text not null check(char_length(evidence) between 5 and 2000),contact text check(char_length(contact)<=200),
  status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now(),
  delete_contact_after timestamptz not null default now()+interval '30 days'
);
create index corrections_place_idx on public.owner_correction_requests(place_id);
create table public.place_facts (
  id uuid primary key default gen_random_uuid(),place_id uuid not null references public.places(id),
  field text not null,value jsonb not null,source text not null check(source in ('contributor','owner','heyyumi','gemini')),
  observed_at timestamptz not null default now(),status text not null default 'pending' check(status in ('pending','approved','rejected')),
  correction_id uuid references public.owner_correction_requests(id),created_at timestamptz not null default now()
);
create index place_facts_place_idx on public.place_facts(place_id);
create index place_facts_correction_idx on public.place_facts(correction_id);
create table public.reports (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
  kind text not null check(kind in ('place','endorsement','user','appeal')),entity_id uuid not null,
  reason text not null check(char_length(reason) between 5 and 2000),status text not null default 'pending' check(status in ('pending','reviewed','rejected')),
  created_at timestamptz not null default now()
);
create index reports_user_idx on public.reports(user_id);
create table public.moderation_decisions (
  id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),
  entity_kind text not null,entity_id uuid not null,decision text not null,reason text not null check(char_length(reason)>=5),
  created_at timestamptz not null default now()
);
alter table public.place_reviews enable row level security;
alter table public.endorsement_ratings enable row level security;
alter table public.owner_correction_requests enable row level security;
alter table public.place_facts enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_decisions enable row level security;
revoke all on public.place_reviews,public.endorsement_ratings,public.owner_correction_requests,public.place_facts,public.reports,public.moderation_decisions from anon,authenticated;
grant select on public.place_reviews,public.endorsement_ratings,public.place_facts to anon,authenticated;
grant select on public.reports to authenticated;
grant all on public.place_reviews,public.endorsement_ratings,public.owner_correction_requests,public.place_facts,public.reports,public.moderation_decisions to service_role;
create policy reviews_public on public.place_reviews for select to anon,authenticated using(exists(select 1 from public.places p where p.id=place_id and p.status='published'));
create policy ratings_public on public.endorsement_ratings for select to anon,authenticated using(exists(select 1 from public.endorsement_versions v where v.id=endorsement_version_id));
create policy facts_public on public.place_facts for select to anon,authenticated using(status='approved' and exists(select 1 from public.places p where p.id=place_id and p.status='published'));
create policy reports_own on public.reports for select to authenticated using(user_id=(select auth.uid()));
create unique index endorsement_one_pending on public.endorsement_versions(endorsement_id) where status='pending';

create function public.community_action(p_actor uuid,p_action text,p_request_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_role text;v_result jsonb;v_old public.api_requests%rowtype;v_id uuid;v_place uuid;v_owner uuid;v_version int;
  v_item record;v_approved boolean;v_kind text;v_reason text;v_count int;
begin
  if p_action='owner_correction' then
    if p_request_id is null or p_payload->>'consent'<>'true' or not exists(select 1 from public.places where id=(p_payload->>'placeId')::uuid and status='published') then raise exception 'Invalid correction' using errcode='22023';end if;
    select * into v_item from public.owner_correction_requests where request_id=p_request_id;
    if found then
      if v_item.place_id<>(p_payload->>'placeId')::uuid or v_item.field<>p_payload->>'field' or v_item.value<>p_payload->>'value' or v_item.evidence<>p_payload->>'evidence' or coalesce(v_item.contact,'')<>coalesce(p_payload->>'contact','') then raise exception 'Idempotency conflict' using errcode='LR409';end if;
      return jsonb_build_object('id',v_item.id,'status',v_item.status);
    end if;
    insert into public.owner_correction_requests(request_id,place_id,field,value,evidence,contact) values(p_request_id,(p_payload->>'placeId')::uuid,p_payload->>'field',p_payload->>'value',p_payload->>'evidence',nullif(p_payload->>'contact','')) returning id into v_id;
    return jsonb_build_object('id',v_id,'status','pending');
  end if;
  if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'User required' using errcode='28000';end if;
  select role into v_role from public.user_roles where user_id=p_actor;
  if p_action in ('queue','decide') and coalesce(v_role,'traveler') not in ('moderator','admin') then raise exception 'Moderator required' using errcode='42501';end if;
  if p_action='workspace' then
    return jsonb_build_object('id',p_actor,'role',coalesce(v_role,'traveler'),'displayName',coalesce((select display_name from public.profiles where user_id=p_actor),'동네 탐험가'),
      'contributions',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'versionId',v.id,'placeName',p.name,'text',v.text,'status',v.status,'version',v.version) order by v.created_at desc)
      from public.endorsements e join public.places p on p.id=e.place_id join public.endorsement_versions v on v.endorsement_id=e.id where e.user_id=p_actor),'[]'::jsonb));
  end if;
  if p_action='queue' then
    select jsonb_build_object('queue',coalesce(jsonb_agg(q.item order by q.created_at),'[]'::jsonb),'history',coalesce((select jsonb_agg(h) from(select id,action,created_at,details from public.audit_logs order by id desc limit 50)h),'[]'::jsonb)) into v_result from (
      select created_at,jsonb_build_object('id',id,'kind','place','title',name,'body',address,'status',status,'createdAt',created_at) item from public.places where status='pending'
      union all select v.created_at,jsonb_build_object('id',v.id,'kind','endorsement','title',p.name,'body',v.text,'status',v.status,'createdAt',v.created_at,'userId',e.user_id,'placeId',p.id) from public.endorsement_versions v join public.endorsements e on e.id=v.endorsement_id join public.places p on p.id=e.place_id where v.status='pending'
      union all select s.created_at,jsonb_build_object('id',s.id,'kind','submission','title',s.name,'body',s.address || E'\n' || s.endorsement_text,'status',s.status,'createdAt',s.created_at,'userId',s.user_id,'candidates',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'address',p.address)) from public.places p where p.status in ('pending','published') and (lower(regexp_replace(p.name,'\s','','g'))=lower(regexp_replace(s.name,'\s','','g')) or (abs(p.lat-s.lat)<0.001 and abs(p.lng-s.lng)<0.001))),'[]'::jsonb)) from public.place_submissions s where s.status='pending'
      union all select c.created_at,jsonb_build_object('id',c.id,'kind','correction','title',p.name || ' · ' || c.field,'body',c.value || E'\n근거: ' || c.evidence,'status',c.status,'createdAt',c.created_at,'placeId',c.place_id) from public.owner_correction_requests c join public.places p on p.id=c.place_id where c.status='pending'
      union all select created_at,jsonb_build_object('id',id,'kind','report','title',kind || ' 신고/이의 신청','body',reason,'status',status,'createdAt',created_at,'userId',user_id) from public.reports where status='pending'
    )q;
    return v_result;
  end if;
  if p_request_id is null then raise exception 'Request ID required' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select * into v_old from public.api_requests where user_id=p_actor and request_id=p_request_id;
  if found then
    if v_old.operation<>p_action or v_old.payload<>p_payload then raise exception 'Idempotency conflict' using errcode='LR409';end if;
    return v_old.result;
  end if;
  if (select count(*) from public.api_requests where user_id=p_actor and created_at>now()-interval '1 minute')>=30 then raise exception 'Rate exceeded' using errcode='LR429';end if;
  if p_action='profile' then
    if char_length(btrim(p_payload->>'displayName')) not between 1 and 40 then raise exception 'Invalid profile' using errcode='22023';end if;
    insert into public.profiles(user_id,display_name)values(p_actor,btrim(p_payload->>'displayName'))on conflict(user_id)do update set display_name=excluded.display_name;
    v_result:=jsonb_build_object('ok',true);
  elsif p_action='edit_endorsement' then
    select * into v_item from public.endorsements where id=(p_payload->>'id')::uuid and user_id=p_actor and active for update;
    if not found then raise exception 'Not owner' using errcode='42501';end if;
    if char_length(btrim(p_payload->>'text')) not between 5 and 200 then raise exception 'Invalid text' using errcode='22023';end if;
    update public.endorsement_versions set status='superseded' where endorsement_id=v_item.id and status='pending';
    select coalesce(max(version),0)+1 into v_version from public.endorsement_versions where endorsement_id=v_item.id;
    insert into public.endorsement_versions(endorsement_id,version,text)values(v_item.id,v_version,btrim(p_payload->>'text')) returning id into v_id;
    v_result:=jsonb_build_object('id',v_id,'status','pending');
  elsif p_action='feedback' then
    v_place:=(p_payload->>'placeId')::uuid;
    if not exists(select 1 from public.places where id=v_place and status='published') or (p_payload->>'visitedOn')::date>current_date then raise exception 'Invalid visit' using errcode='22023';end if;
    if p_payload ? 'endorsementVersionId' then
      select e.user_id into v_owner from public.endorsement_versions v join public.endorsements e on e.id=v.endorsement_id where v.id=(p_payload->>'endorsementVersionId')::uuid and e.place_id=v_place and e.published_version_id=v.id and e.active and v.status='published';
      if v_owner is null or v_owner=p_actor then raise exception 'Invalid endorsement rating' using errcode='42501';end if;
    end if;
    insert into public.place_reviews(user_id,place_id,rating,text,visited_on,affiliated)values(p_actor,v_place,(p_payload->>'rating')::smallint,coalesce(p_payload->>'text',''),(p_payload->>'visitedOn')::date,(p_payload->>'affiliated')::boolean)
    on conflict(user_id,place_id)do update set rating=excluded.rating,text=excluded.text,visited_on=excluded.visited_on,affiliated=excluded.affiliated,verification_state='unverified' returning id into v_id;
    if p_payload ? 'endorsementVersionId' then
      insert into public.endorsement_ratings(user_id,endorsement_version_id,review_id,helpfulness)values(p_actor,(p_payload->>'endorsementVersionId')::uuid,v_id,(p_payload->>'helpfulness')::smallint)
      on conflict(user_id,endorsement_version_id)do update set helpfulness=excluded.helpfulness;
    end if;
    v_result:=jsonb_build_object('id',v_id,'verification','unverified','rewardIssued',false);
  elsif p_action='report' then
    if p_payload->>'kind'='appeal' and (p_payload->>'entityId')::uuid<>p_actor then raise exception 'Own appeal required' using errcode='42501';end if;
    insert into public.reports(user_id,kind,entity_id,reason)values(p_actor,p_payload->>'kind',(p_payload->>'entityId')::uuid,p_payload->>'reason')returning id into v_id;
    v_result:=jsonb_build_object('id',v_id,'status','pending');
  elsif p_action='decide' then
    v_id:=(p_payload->>'id')::uuid;v_kind:=p_payload->>'kind';v_approved:=p_payload->>'decision'='approve';v_reason:=btrim(p_payload->>'reason');
    if char_length(v_reason)<5 or p_payload->>'decision' not in ('approve','reject') then raise exception 'Decision reason required' using errcode='22023';end if;
    if v_kind='place' then
      update public.places set status=case when v_approved then 'published' else 'rejected' end where id=v_id and status='pending';get diagnostics v_count=row_count;
    elsif v_kind='endorsement' then
      select v.*,e.place_id into v_item from public.endorsement_versions v join public.endorsements e on e.id=v.endorsement_id where v.id=v_id and v.status='pending' for update of v;
      if not found then raise exception 'Already reviewed' using errcode='LR409';end if;
      if v_approved and not exists(select 1 from public.places where id=v_item.place_id and status='published') then raise exception 'Approve place first' using errcode='LR409';end if;
      if v_approved then
        update public.endorsement_versions set status='superseded' where endorsement_id=v_item.endorsement_id and status='published';
        update public.endorsements set published_version_id=v_id where id=v_item.endorsement_id;
      end if;
      update public.endorsement_versions set status=case when v_approved then 'published' else 'rejected' end where id=v_id;v_count:=1;
    elsif v_kind='submission' then
      select * into v_item from public.place_submissions where id=v_id and status='pending' for update;
      if not found then raise exception 'Already reviewed' using errcode='LR409';end if;
      if v_approved then
        v_place:=(p_payload->>'placeId')::uuid;
        if v_place is null then
          if p_payload->>'confirmNew' is distinct from 'true' then raise exception 'Explicit new place confirmation required' using errcode='LR409';end if;
          insert into public.places(name,address,lat,lng,status)values(v_item.name,v_item.address,v_item.lat,v_item.lng,'published')returning id into v_place;
        elsif not exists(select 1 from public.places where id=v_place and status='published') then raise exception 'Invalid target place' using errcode='22023';end if;
        if exists(select 1 from public.endorsements where user_id=v_item.user_id and place_id=v_place and active) then raise exception 'Existing active endorsement; resolve explicitly' using errcode='LR409';end if;
        insert into public.endorsements(user_id,place_id)values(v_item.user_id,v_place)returning id into v_owner;
        insert into public.endorsement_versions(endorsement_id,version,text,status)values(v_owner,1,v_item.endorsement_text,'published')returning id into v_owner;
        update public.endorsements set published_version_id=v_owner where id=(select endorsement_id from public.endorsement_versions where id=v_owner);
      end if;
      update public.place_submissions set status=case when v_approved then 'published' else 'rejected' end,resolved_place_id=v_place where id=v_id;v_count:=1;
    elsif v_kind='correction' then
      select * into v_item from public.owner_correction_requests where id=v_id and status='pending' for update;
      if not found then raise exception 'Already reviewed' using errcode='LR409';end if;
      if v_approved then
        insert into public.place_facts(place_id,field,value,source,status,correction_id)values(v_item.place_id,v_item.field,to_jsonb(v_item.value),'owner','approved',v_id);
        if v_item.field='name' then update public.places set name=v_item.value where id=v_item.place_id;end if;
        if v_item.field='address' then update public.places set address=v_item.value where id=v_item.place_id;end if;
      end if;
      update public.owner_correction_requests set status=case when v_approved then 'approved' else 'rejected' end,contact=null where id=v_id;v_count:=1;
    elsif v_kind='report' then
      update public.reports set status=case when v_approved then 'reviewed' else 'rejected' end where id=v_id and status='pending';get diagnostics v_count=row_count;
    else raise exception 'Unknown entity' using errcode='22023';end if;
    if v_count<>1 then raise exception 'Already reviewed or missing' using errcode='LR409';end if;
    insert into public.moderation_decisions(actor_id,entity_kind,entity_id,decision,reason)values(p_actor,v_kind,v_id,p_payload->>'decision',v_reason);
    v_result:=jsonb_build_object('id',v_id,'reviewed',true);
  else raise exception 'Unknown action' using errcode='22023';end if;
  insert into public.api_requests(user_id,request_id,operation,payload,result)values(p_actor,p_request_id,p_action,p_payload,v_result);
  insert into public.audit_logs(actor_id,action,entity_id,details)values(p_actor,'community.'||p_action,v_id,jsonb_build_object('reason',v_reason,'kind',v_kind));
  return v_result;
end;
$$;
revoke all on function public.community_action(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.community_action(uuid,text,uuid,jsonb) to service_role;
