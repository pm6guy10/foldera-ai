-- Direct auth.users email lookup via RPC.
-- Avoids GoTrue admin.listUsers() NULL column scan bug.
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(lookup_email text)
RETURNS uuid AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(lookup_email) LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;
