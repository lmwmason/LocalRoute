-- A confirmed draft is private evidence, never an approved canonical menu fact.
create table public.contribution_menu_drafts(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
 request_id uuid not null,attachment_id uuid not null,place_photo_id uuid not null references public.place_photos(id),
 draft jsonb not null check(jsonb_typeof(draft)='object'and octet_length(draft::text)<=65536),
 created_at timestamptz not null default now(),unique(user_id,request_id)
);
create index contribution_menu_drafts_attachment_idx on public.contribution_menu_drafts(attachment_id);
alter table public.contribution_menu_drafts enable row level security;
revoke all on public.contribution_menu_drafts from public,anon,authenticated;
grant select on public.contribution_menu_drafts to authenticated;
grant all on public.contribution_menu_drafts to service_role;
create policy contribution_menu_drafts_own on public.contribution_menu_drafts for select to authenticated using(user_id=(select auth.uid()));
create function public.submit_contribution_with_menu(p_actor uuid,p_request_id uuid,p_payload jsonb,p_provider jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;v_menu jsonb:=p_payload->'menuDraft';v_previous jsonb;v_attachment uuid;v_item jsonb;
begin
 if v_menu is null or v_menu='null'::jsonb then raise exception'Menu draft required'using errcode='22023';end if;
 if jsonb_typeof(v_menu)is distinct from'object'or v_menu->'confirmed'is distinct from'true'::jsonb or v_menu->>'source'is distinct from'user_confirmed_draft'or jsonb_typeof(v_menu->'items')is distinct from'array'or octet_length(v_menu::text)>65536 then raise exception'Invalid menu draft'using errcode='22023';end if;
 if jsonb_array_length(v_menu->'items')>60 then raise exception'Too many menu items'using errcode='22023';end if;
 for v_item in select value from jsonb_array_elements(v_menu->'items')loop
  if jsonb_typeof(v_item)is distinct from'object'or char_length(btrim(v_item->>'name'))not between 1 and 240 or v_item->>'name'is null or
   (v_item->'price'<>'null'::jsonb and(jsonb_typeof(v_item->'price')is distinct from'number'or(v_item->>'price')::numeric<0 or(v_item->>'price')::numeric>1000000000))or
   (v_item->'currency'<>'null'::jsonb and(jsonb_typeof(v_item->'currency')is distinct from'string'or char_length(btrim(v_item->>'currency'))not between 1 and 12))then raise exception'Invalid menu item'using errcode='22023';end if;
 end loop;
 -- The existing RPC enforces ownership, locality, required real photograph and idempotency.
 v_result:=public.submit_photographed_contribution(p_actor,p_request_id,p_payload,p_provider);
 select draft into v_previous from public.contribution_menu_drafts where user_id=p_actor and request_id=p_request_id;
 if found then
  if v_previous<>v_menu then raise exception'Menu request changed'using errcode='LR409';end if;
  return v_result;
 end if;
 select attachment_id into v_attachment from public.place_photos where id=(p_payload->>'photoId')::uuid and user_id=p_actor and request_id=p_request_id and state='linked';
 if v_attachment is null then raise exception'Owned place photograph required'using errcode='42501';end if;
 insert into public.contribution_menu_drafts(user_id,request_id,attachment_id,place_photo_id,draft)values(p_actor,p_request_id,v_attachment,(p_payload->>'photoId')::uuid,v_menu);
 return v_result;
end;$$;
revoke all on function public.submit_contribution_with_menu(uuid,uuid,jsonb,jsonb)from public,anon,authenticated;
grant execute on function public.submit_contribution_with_menu(uuid,uuid,jsonb,jsonb)to service_role;
