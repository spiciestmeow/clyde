-- Run after series-catalog.sql. Public readers can react without creating an account.
-- A persistent anonymous browser UUID lets the same browser toggle its own reactions.

create table if not exists public.series_reaction_totals (
  series_slug text not null references public.series(slug) on delete cascade,
  reaction_key text not null check (reaction_key in ('like', 'love', 'happy', 'wow', 'sad', 'angry')),
  count integer not null default 0 check (count >= 0),
  primary key (series_slug, reaction_key)
);

create table if not exists public.series_reaction_votes (
  series_slug text not null references public.series(slug) on delete cascade,
  visitor_id uuid not null,
  reaction_key text not null check (reaction_key in ('like', 'love', 'happy', 'wow', 'sad', 'angry')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (series_slug, visitor_id)
);

create table if not exists public.series_source_reaction_votes (
  series_slug text not null references public.series(slug) on delete cascade,
  source_url text not null,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (series_slug, source_url, visitor_id)
);

alter table public.series_reaction_totals enable row level security;
alter table public.series_reaction_votes enable row level security;
alter table public.series_source_reaction_votes enable row level security;
revoke all on public.series_reaction_totals, public.series_reaction_votes, public.series_source_reaction_votes from public, anon, authenticated;

-- Preserve the starting totals currently shown for these series.
insert into public.series_reaction_totals (series_slug, reaction_key, count)
select s.slug, seed.reaction_key, seed.count
from (values
  ('lumberjack', 'like', 1), ('lumberjack', 'love', 7), ('lumberjack', 'happy', 2), ('lumberjack', 'wow', 3), ('lumberjack', 'sad', 0), ('lumberjack', 'angry', 0),
  ('murim-psychopath', 'like', 3), ('murim-psychopath', 'love', 33), ('murim-psychopath', 'happy', 1), ('murim-psychopath', 'wow', 0), ('murim-psychopath', 'sad', 1), ('murim-psychopath', 'angry', 4),
  ('the-crazy-villain-regains-his-sanity', 'like', 6), ('the-crazy-villain-regains-his-sanity', 'love', 36), ('the-crazy-villain-regains-his-sanity', 'happy', 3), ('the-crazy-villain-regains-his-sanity', 'wow', 3), ('the-crazy-villain-regains-his-sanity', 'sad', 3), ('the-crazy-villain-regains-his-sanity', 'angry', 3)
) as seed(series_slug, reaction_key, count)
join public.series s on s.slug = seed.series_slug
on conflict (series_slug, reaction_key) do nothing;

create or replace function public.get_series_reaction_state(p_series_slug text, p_visitor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_counts jsonb;
  selected_key text;
begin
  if not exists (select 1 from public.series where slug = p_series_slug) then
    raise exception 'Unknown series';
  end if;
  select jsonb_object_agg(keys.reaction_key, coalesce(t.count, 0))
    into result_counts
    from unnest(array['like', 'love', 'happy', 'wow', 'sad', 'angry']) as keys(reaction_key)
    left join public.series_reaction_totals t
      on t.series_slug = p_series_slug and t.reaction_key = keys.reaction_key;
  select v.reaction_key into selected_key
    from public.series_reaction_votes v
    where v.series_slug = p_series_slug and v.visitor_id = p_visitor_id;
  return jsonb_build_object('counts', coalesce(result_counts, '{}'::jsonb), 'selected', selected_key);
end;
$$;

create or replace function public.toggle_series_reaction(p_series_slug text, p_visitor_id uuid, p_reaction_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous_key text;
begin
  if p_reaction_key not in ('like', 'love', 'happy', 'wow', 'sad', 'angry') then
    raise exception 'Invalid reaction';
  end if;
  if not exists (select 1 from public.series where slug = p_series_slug) then
    raise exception 'Unknown series';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_series_slug || ':' || p_visitor_id::text, 0));
  select reaction_key into previous_key
    from public.series_reaction_votes
    where series_slug = p_series_slug and visitor_id = p_visitor_id;
  if previous_key = p_reaction_key then
    delete from public.series_reaction_votes where series_slug = p_series_slug and visitor_id = p_visitor_id;
    update public.series_reaction_totals set count = greatest(0, count - 1)
      where series_slug = p_series_slug and reaction_key = p_reaction_key;
  else
    if previous_key is not null then
      update public.series_reaction_totals set count = greatest(0, count - 1)
        where series_slug = p_series_slug and reaction_key = previous_key;
    end if;
    insert into public.series_reaction_votes (series_slug, visitor_id, reaction_key)
      values (p_series_slug, p_visitor_id, p_reaction_key)
      on conflict (series_slug, visitor_id) do update
        set reaction_key = excluded.reaction_key, updated_at = now();
    insert into public.series_reaction_totals (series_slug, reaction_key, count)
      values (p_series_slug, p_reaction_key, 1)
      on conflict (series_slug, reaction_key) do update set count = public.series_reaction_totals.count + 1;
  end if;
  return public.get_series_reaction_state(p_series_slug, p_visitor_id);
end;
$$;

create or replace function public.get_series_source_reaction_state(p_series_slug text, p_visitor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_counts jsonb;
  selected_urls jsonb;
begin
  if not exists (select 1 from public.series where slug = p_series_slug) then
    raise exception 'Unknown series';
  end if;
  select coalesce(jsonb_object_agg(source_url, source_count), '{}'::jsonb)
    into result_counts
    from (
      select source_url, count(*)::integer as source_count
      from public.series_source_reaction_votes
      where series_slug = p_series_slug
      group by source_url
    ) counts;
  select coalesce(jsonb_agg(source_url), '[]'::jsonb)
    into selected_urls
    from public.series_source_reaction_votes
    where series_slug = p_series_slug and visitor_id = p_visitor_id;
  return jsonb_build_object('counts', result_counts, 'selected', selected_urls);
end;
$$;

create or replace function public.toggle_series_source_reaction(p_series_slug text, p_source_url text, p_visitor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.series where slug = p_series_slug) then
    raise exception 'Unknown series';
  end if;
  if length(p_source_url) > 2048 or not (p_source_url ~ '^https?://') then
    raise exception 'Invalid source URL';
  end if;
  if not exists (
    select 1
    from public.series s
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.sources) = 'array' then s.sources else '[]'::jsonb end
    ) source
    where s.slug = p_series_slug and source ->> 'url' = p_source_url
  ) then
    raise exception 'Source does not belong to this series';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_series_slug || ':' || p_source_url || ':' || p_visitor_id::text, 0));
  if exists (
    select 1 from public.series_source_reaction_votes
    where series_slug = p_series_slug and source_url = p_source_url and visitor_id = p_visitor_id
  ) then
    delete from public.series_source_reaction_votes
      where series_slug = p_series_slug and source_url = p_source_url and visitor_id = p_visitor_id;
  else
    insert into public.series_source_reaction_votes (series_slug, source_url, visitor_id)
      values (p_series_slug, p_source_url, p_visitor_id);
  end if;
  return public.get_series_source_reaction_state(p_series_slug, p_visitor_id);
end;
$$;

revoke all on function public.get_series_reaction_state(text, uuid) from public, anon, authenticated;
revoke all on function public.toggle_series_reaction(text, uuid, text) from public, anon, authenticated;
revoke all on function public.get_series_source_reaction_state(text, uuid) from public, anon, authenticated;
revoke all on function public.toggle_series_source_reaction(text, text, uuid) from public, anon, authenticated;
grant execute on function public.get_series_reaction_state(text, uuid) to anon, authenticated;
grant execute on function public.toggle_series_reaction(text, uuid, text) to anon, authenticated;
grant execute on function public.get_series_source_reaction_state(text, uuid) to anon, authenticated;
grant execute on function public.toggle_series_source_reaction(text, text, uuid) to anon, authenticated;
