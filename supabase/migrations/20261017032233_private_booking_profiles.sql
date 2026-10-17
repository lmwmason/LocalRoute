-- Customer details never enter public identities, Auth metadata or model prompts.
create table public.booking_profiles(
 user_id uuid primary key references auth.users(id)on delete cascade,
 guest_name text not null default''check(char_length(guest_name)<=80),
 guest_phone text not null check(guest_phone ~ '^\+?[0-9]{7,15}$'),
 consent_version text not null check(consent_version='booking-profile-v1'),
 consented_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.profiles add column booking_onboarding_seen boolean not null default false;
alter table public.booking_profiles enable row level security;
revoke all on public.booking_profiles from anon,authenticated;
grant select on public.booking_profiles to authenticated;
grant all on public.booking_profiles to service_role;
create policy booking_profile_own on public.booking_profiles for select to authenticated using(user_id=(select auth.uid()));
create function public.booking_profile_action(p_actor uuid,p_action text,p_payload jsonb default'{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_phone text:=btrim(p_payload->>'guestPhone');v_name text:=coalesce(btrim(p_payload->>'guestName'),'');
begin
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor)then raise exception'User required'using errcode='28000';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 if p_action='get'then
  return jsonb_build_object('profile',(select jsonb_build_object('guestName',guest_name,'guestPhone',guest_phone)from public.booking_profiles where user_id=p_actor),'onboardingSeen',coalesce((select booking_onboarding_seen from public.profiles where user_id=p_actor),false));
 end if;
 if p_action='save'then
  if p_payload->>'consentVersion'is distinct from'booking-profile-v1'or v_phone is null or v_phone !~ '^\+?[0-9]{7,15}$'or char_length(v_name)>80 or v_name~'[[:cntrl:]]'then raise exception'Invalid booking profile'using errcode='22023';end if;
  insert into public.booking_profiles(user_id,guest_name,guest_phone,consent_version)values(p_actor,v_name,v_phone,'booking-profile-v1')on conflict(user_id)do update set guest_name=excluded.guest_name,guest_phone=excluded.guest_phone,consented_at=now(),updated_at=now();
 elsif p_action='delete'then delete from public.booking_profiles where user_id=p_actor;
 elsif p_action<>'skip'then raise exception'Unknown action'using errcode='22023';end if;
 update public.profiles set booking_onboarding_seen=true where user_id=p_actor;
 insert into public.audit_logs(actor_id,action)values(p_actor,'booking_profile.'||p_action);
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.booking_profile_action(uuid,text,jsonb)from public,anon,authenticated;
grant execute on function public.booking_profile_action(uuid,text,jsonb)to service_role;
