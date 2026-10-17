create function public.submit_provider_contribution(p_user_id uuid,p_request_id uuid,p_provider jsonb,p_text text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_payload jsonb := jsonb_build_object('provider',p_provider,'text',btrim(p_text));
  v_old public.api_requests%rowtype;
  v_place uuid;
  v_id uuid;
  v_result jsonb;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) then raise exception 'User required' using errcode='28000'; end if;
  if p_request_id is null or char_length(btrim(p_text)) not between 5 and 200 or p_text is null or nullif(p_provider->>'id','') is null then raise exception 'Invalid provider contribution' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into v_old from public.api_requests where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_old.operation <> 'provider_contribution' or v_old.payload <> v_payload then raise exception 'Idempotency conflict' using errcode='LR409'; end if;
    return v_old.result;
  end if;
  if (select count(*) from public.api_requests where user_id=p_user_id and created_at > now()-interval '1 minute') >= 10 then raise exception 'Submission rate exceeded' using errcode='LR429'; end if;
  perform pg_advisory_xact_lock(hashtextextended('heyyumi:' || (p_provider->>'id'),1));
  select place_id into v_place from public.place_external_ids where provider='heyyumi' and external_id=p_provider->>'id';
  if v_place is null then
    -- This creates an unlisted canonical candidate. A moderator must approve identity before publication.
    insert into public.places(name,address,category,lat,lng) values (
      p_provider->>'name',coalesce(nullif(p_provider->'address'->>'road',''),p_provider->'address'->>'jibun'),
      coalesce(p_provider->>'categoryLabel',p_provider->>'category','식당'),
      (p_provider->'location'->>'lat')::double precision,(p_provider->'location'->>'lng')::double precision
    ) returning id into v_place;
    insert into public.place_external_ids(place_id,provider,external_id,confidence,observed_at,possibly_closed)
      values(v_place,'heyyumi',p_provider->>'id',(p_provider->>'confidence')::double precision,(p_provider->>'lastSeenAt')::timestamptz,coalesce((p_provider->>'possiblyClosed')::boolean,false));
  end if;
  if not exists(select 1 from public.places where id=v_place and status in ('pending','published')) then raise exception 'Place not available' using errcode='LR404'; end if;
  insert into public.endorsements(user_id,place_id) values(p_user_id,v_place) returning id into v_id;
  insert into public.endorsement_versions(endorsement_id,version,text) values(v_id,1,btrim(p_text));
  v_result := jsonb_build_object('id',v_id,'status','pending');
  insert into public.api_requests(user_id,request_id,operation,payload,result) values(p_user_id,p_request_id,'provider_contribution',v_payload,v_result);
  insert into public.audit_logs(actor_id,action,entity_id,details) values(p_user_id,'provider_contribution.submitted',v_id,jsonb_build_object('place_id',v_place,'provider','heyyumi'));
  return v_result;
end;
$$;
revoke all on function public.submit_provider_contribution(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_provider_contribution(uuid,uuid,jsonb,text) to service_role;
