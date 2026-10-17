-- Operator-reviewed canonical display media; never visit evidence or LP eligibility.
create table public.place_display_media (
 place_id uuid primary key references public.places(id) on delete cascade,
 asset_type text not null check(asset_type in('photo','ai_illustration')),
 asset_path text not null check(asset_path ~ '^/(restaurant-illustrations/[a-z0-9][a-z0-9_-]{0,159}\.png|example-images/[a-z0-9][a-z0-9_-]{0,159}\.(jpg|png)|place-display-media/[a-z0-9][a-z0-9_-]{0,159}\.(jpg|png|webp))$'),
 alt text not null check(length(btrim(alt)) between 1 and 700),
 credit text not null check(length(btrim(credit)) between 1 and 700),
 license_label text not null check(length(btrim(license_label)) between 1 and 300),
 source_url text not null check(length(source_url)<=2000 and source_url ~ '^https://[^[:space:]/?#@]+([/?][^[:space:]#]*)?$'),
 observed_at timestamptz not null check(observed_at<=now()+interval'5 minutes'),
 changes text not null check(length(btrim(changes)) between 1 and 1200),
 check(asset_type='ai_illustration' or (asset_path !~ '^/restaurant-illustrations/' and asset_path !~ '-ai\.(png|jpg|webp)$'))
);
alter table public.place_display_media enable row level security;
revoke all on public.place_display_media from public,anon,authenticated;
grant select on public.place_display_media to anon,authenticated;
grant select,insert,update,delete on public.place_display_media to service_role;
create policy display_media_published_read on public.place_display_media for select to anon,authenticated
 using(exists(select 1 from public.places p where p.id=place_id and p.status='published'));
