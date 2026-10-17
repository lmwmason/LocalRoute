-- Hosted Supabase may grant explicit role defaults in addition to PUBLIC.
revoke all on function public.locality_label(text,text,text)from public,anon,authenticated;
grant execute on function public.locality_label(text,text,text)to service_role;
