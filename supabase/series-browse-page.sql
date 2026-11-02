-- Apply once in the Supabase SQL editor. Filters, sorting, and pagination run
-- in Postgres so the browser receives only the requested page of full records.
create or replace function public.get_series_browse_page(p_options jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with options as (
    select
      greatest(1, coalesce((p_options->>'page')::integer, 1)) as page_number,
      greatest(1, least(100, coalesce((p_options->>'pageSize')::integer, 36))) as page_size,
      lower(trim(coalesce(p_options->>'search', ''))) as search_term,
      coalesce(array(select value from jsonb_array_elements_text(coalesce(p_options->'statuses', '[]'::jsonb)) as arr(value)), '{}'::text[]) as statuses,
      coalesce(array(select lower(value) from jsonb_array_elements_text(coalesce(p_options->'categories', '[]'::jsonb)) as arr(value)), '{}'::text[]) as categories,
      coalesce(array(select lower(value) from jsonb_array_elements_text(coalesce(p_options->'includeGenres', '[]'::jsonb)) as arr(value)), '{}'::text[]) as include_genres,
      coalesce(array(select lower(value) from jsonb_array_elements_text(coalesce(p_options->'excludeGenres', '[]'::jsonb)) as arr(value)), '{}'::text[]) as exclude_genres,
      nullif(p_options->>'minChapters', '')::numeric as min_chapters,
      nullif(p_options->>'maxChapters', '')::numeric as max_chapters,
      nullif(p_options->>'createdAfter', '')::date as created_after,
      nullif(p_options->>'createdBefore', '')::date as created_before,
      coalesce(p_options->>'availability', 'Any') as availability,
      coalesce(p_options->>'sort', 'latest') as sort_mode,
      coalesce(p_options->>'direction', 'desc') as sort_direction
  ), enriched as (
    select s.*,
      coalesce(
        case when coalesce(s.facts->>'latest_chapter_number', '') ~ '^[0-9]+([.][0-9]+)?$' then (s.facts->>'latest_chapter_number')::numeric end,
        case when coalesce(s.facts->>'last_chapter_number', '') ~ '^[0-9]+([.][0-9]+)?$' then (s.facts->>'last_chapter_number')::numeric end,
        case
          when coalesce(s.chapters->0->>'title', '') ~ '[0-9]+([.][0-9]+)? *$'
          then substring(s.chapters->0->>'title' from '([0-9]+([.][0-9]+)?) *$')::numeric
          else null
        end
      ) as chapter_number,
      coalesce(
        case when coalesce(s.facts->>'last_chapter_added_at', s.facts->>'lastUpdate', s.facts->>'Last update') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          then (coalesce(s.facts->>'last_chapter_added_at', s.facts->>'lastUpdate', s.facts->>'Last update'))::timestamptz end,
        (select max(nullif(source->>'latestChapterAt', '')::timestamptz)
          from jsonb_array_elements(case when jsonb_typeof(s.sources) = 'array' then s.sources else '[]'::jsonb end) source
          where coalesce(source->>'latestChapterAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'),
        (select nullif(coalesce(s.chapters->0->>'createdAt', s.chapters->0->>'created_at', s.chapters->0->>'date', s.chapters->0->>'releasedAt'), '')::timestamptz
          where coalesce(s.chapters->0->>'createdAt', s.chapters->0->>'created_at', s.chapters->0->>'date', s.chapters->0->>'releasedAt', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'),
        s.created_at
      ) as release_at,
      case
        when coalesce(s.facts->>'createdAt', s.facts->>'createdDate', s.facts->>'releaseDate', s.facts->>'released', s.year::text) ~ '^[0-9]{4}$'
          then to_date(coalesce(s.facts->>'createdAt', s.facts->>'createdDate', s.facts->>'releaseDate', s.facts->>'released', s.year::text) || '-01-01', 'YYYY-MM-DD')
        when coalesce(s.facts->>'createdAt', s.facts->>'createdDate', s.facts->>'releaseDate', s.facts->>'released') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          then substring(coalesce(s.facts->>'createdAt', s.facts->>'createdDate', s.facts->>'releaseDate', s.facts->>'released') from 1 for 10)::date
        else null
      end as series_date,
      greatest(
        coalesce(nullif(substring(trim(coalesce(s.rating, '')) from '^[0-9]+[.][0-9]+'), '')::numeric, nullif(substring(trim(coalesce(s.rating, '')) from '^[0-9]+'), '')::numeric, 0),
        coalesce((select max(coalesce(nullif(substring(trim(source->>'rating') from '^[0-9]+[.][0-9]+'), '')::numeric, nullif(substring(trim(source->>'rating') from '^[0-9]+'), '')::numeric))
          from jsonb_array_elements(case when jsonb_typeof(s.sources) = 'array' then s.sources else '[]'::jsonb end) source
          where coalesce(source->>'rating', '') ~ '^[[:space:]]*[0-9]+([.][0-9]+)?'), 0),
        coalesce((select max(coalesce(nullif(substring(trim(tracker->>'rating') from '^[0-9]+[.][0-9]+'), '')::numeric, nullif(substring(trim(tracker->>'rating') from '^[0-9]+'), '')::numeric))
          from jsonb_array_elements(case when jsonb_typeof(s.trackers) = 'array' then s.trackers else '[]'::jsonb end) tracker
          where coalesce(tracker->>'rating', '') ~ '^[[:space:]]*[0-9]+([.][0-9]+)?'), 0)
      ) as numeric_rating
    from public.series s
  ), filtered as (
    select e.* from enriched e cross join options o
    where (o.search_term = '' or
      e.title ilike '%' || o.search_term || '%' or
      e.category ilike '%' || o.search_term || '%' or
      coalesce(e.facts->>'type', '') ilike '%' || o.search_term || '%' or
      exists (select 1 from unnest(coalesce(e.genres, '{}'::text[])) g where g ilike '%' || o.search_term || '%'))
      and (cardinality(o.statuses) = 0 or lower(e.status) = any(select lower(status_value) from unnest(o.statuses) as status_values(status_value)))
      and (cardinality(o.categories) = 0 or lower(coalesce(nullif(e.category, ''), e.facts->>'type', 'Manhwa')) = any(o.categories))
      and (cardinality(o.include_genres) = 0 or exists (select 1 from unnest(coalesce(e.genres, '{}'::text[])) as series_genres(genre) where lower(genre) = any(o.include_genres)))
      and not exists (select 1 from unnest(coalesce(e.genres, '{}'::text[])) as series_genres(genre) where lower(genre) = any(o.exclude_genres))
      and (o.min_chapters is null or e.chapter_number > 0 and e.chapter_number >= o.min_chapters)
      and (o.max_chapters is null or e.chapter_number > 0 and e.chapter_number <= o.max_chapters)
      and (o.created_after is null or e.series_date >= o.created_after)
      and (o.created_before is null or e.series_date <= o.created_before)
      and (o.availability = 'Any'
        or o.availability = 'On Sale' and exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(e.chapters) = 'array' then e.chapters else '[]'::jsonb end) ch where ch->>'locked' = 'true'
        )
        or o.availability = 'Full Price' and jsonb_array_length(case when jsonb_typeof(e.chapters) = 'array' then e.chapters else '[]'::jsonb end) > 0 and not exists (
          select 1 from jsonb_array_elements(case when jsonb_typeof(e.chapters) = 'array' then e.chapters else '[]'::jsonb end) ch where ch->>'locked' = 'true'
        ))
  ), counted as (
    select count(*)::bigint as total_count from filtered
  ), page_rows as (
    select f.* from filtered f cross join options o
    order by
      case when o.sort_mode = 'popular' and o.sort_direction = 'desc' then f.numeric_rating end desc,
      case when o.sort_mode = 'popular' and o.sort_direction = 'asc' then f.numeric_rating end asc,
      case when o.sort_mode = 'newest' and o.sort_direction = 'desc' then f.created_at end desc,
      case when o.sort_mode = 'newest' and o.sort_direction = 'asc' then f.created_at end asc,
      case when o.sort_mode = 'oldest' and o.sort_direction = 'desc' then f.page_number end desc,
      case when o.sort_mode = 'oldest' and o.sort_direction = 'desc' then f.page_order end desc,
      case when o.sort_mode = 'oldest' and o.sort_direction = 'asc' then f.page_number end asc,
      case when o.sort_mode = 'oldest' and o.sort_direction = 'asc' then f.page_order end asc,
      case when o.sort_mode = 'chapters' and o.sort_direction = 'desc' then f.chapter_number end desc nulls last,
      case when o.sort_mode = 'chapters' and o.sort_direction = 'asc' then f.chapter_number end asc nulls last,
      case when o.sort_mode = 'title' and o.sort_direction = 'desc' then f.title end asc,
      case when o.sort_mode = 'title' and o.sort_direction = 'asc' then f.title end desc,
      case when o.sort_mode in ('latest', 'updated') and o.sort_direction = 'desc' then f.release_at end desc,
      case when o.sort_mode in ('latest', 'updated') and o.sort_direction = 'asc' then f.release_at end asc,
      case when o.sort_mode = 'latest' and o.sort_direction = 'desc' then f.created_at end desc,
      case when o.sort_mode = 'latest' and o.sort_direction = 'asc' then f.created_at end asc,
      f.id desc
    limit (select page_size from options)
    offset ((select page_number from options) - 1) * (select page_size from options)
  )
  select jsonb_build_object(
    'totalCount', counted.total_count,
    'items', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb)
  ) from counted;
$$;

grant execute on function public.get_series_browse_page(jsonb) to anon, authenticated;

create index if not exists series_genres_gin_idx on public.series using gin (genres);
create index if not exists series_category_status_idx on public.series (category, status);
create index if not exists series_created_id_idx on public.series (created_at desc, id desc);
