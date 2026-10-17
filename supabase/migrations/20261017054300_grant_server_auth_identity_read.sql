-- SECURITY INVOKER RPCs independently verify Auth identity. Supabase's live
-- service_role has schema usage but no implicit SELECT on managed auth.users.
-- Grant only the four identity/verification columns, never password/session data.
grant usage on schema auth to service_role;
grant select(id,email,email_confirmed_at,is_anonymous) on auth.users to service_role;
