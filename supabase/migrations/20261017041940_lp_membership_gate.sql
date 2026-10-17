-- Prevent allowance issuance before verified, versioned membership acceptance.
create function public.require_membership_for_lp_grant()returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (select version from public.legal_consent_events where user_id=new.user_id order by id desc limit 1)is distinct from'2026-10-17.1'then
  raise exception'Membership consent required for LP allowance'using errcode='42501';
 end if;
 return new;
end;$$;
revoke all on function public.require_membership_for_lp_grant()from public,anon,authenticated;
create trigger lp_grant_membership before insert on public.monthly_lp_grants for each row execute function public.require_membership_for_lp_grant();
