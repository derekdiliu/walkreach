-- Suggestions for what has been typed so far, from search_names
-- (05-search-names.sql). Kept apart from that file because it needs only the
-- table: the server gets search_names as a dump, not the raw imports.
--
-- Ranked by how the text matches: the start of the name, then the start of
-- any later word in it ("andrews" finds Saint Andrews), then trigram word
-- similarity, which is what forgives a typo: "vicotria" is 0.38 from
-- Victoria Street, so the cut-off is 0.35 - but only from five characters
-- on, since a few letters share a trigram with half the city ("vict" found
-- Temple View). Within each, a suburb comes first, since "chartw" most
-- likely means Chartwell rather than Chartwell Glen, then the closer and the
-- shorter name. The text is matched as typed, never as a pattern: % and _
-- are escaped before LIKE sees them.
-- Also created in 05, but the server only ever runs this file.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION walkreach_suggest(input text, max_rows int)
RETURNS jsonb AS $$
  WITH typed AS (
    SELECT s, replace(replace(replace(s, '\', '\\'), '%', '\%'), '_', '\_') AS pat
    FROM (SELECT lower(unaccent(trim(input))) AS s) t
  ),
  matched AS (
    SELECT n.name, n.kind, n.context, n.geom,
      CASE
        WHEN n.search LIKE typed.pat || '%' THEN 0
        WHEN n.search LIKE '% ' || typed.pat || '%' THEN 1
        ELSE 2
      END AS rank,
      word_similarity(typed.s, n.search) AS sim
    FROM search_names n, typed
    WHERE n.search LIKE typed.pat || '%'
       OR n.search LIKE '% ' || typed.pat || '%'
       OR (length(typed.s) >= 5 AND word_similarity(typed.s, n.search) >= 0.35)
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', name, 'kind', kind, 'context', context,
      'lng', round(ST_X(geom)::numeric, 6), 'lat', round(ST_Y(geom)::numeric, 6)
    ) ORDER BY rank, kind = 'place' DESC, sim DESC, length(name), name, context), '[]'::jsonb)
  FROM (
    SELECT * FROM matched
    ORDER BY rank, kind = 'place' DESC, sim DESC, length(name), name, context
    LIMIT max_rows
  ) top;
$$ LANGUAGE sql STABLE;
