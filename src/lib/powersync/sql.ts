// Raw statements over the local database, each held to an index by `explain.server.test.ts`.

// The explore map's block rows. Never a LEFT JOIN through PowerSync's views: SQLite cannot use the index through
// them and scans (6 s here); an inner join and correlated subqueries both search the index.
export const MAP_SQL = `select b.nid as id, b.name, b.grade_counts, a.nid as area_id, a.name as area_name, a.parent_fk,
    (select g.lat from geolocations g where g.nid = b.geolocation_fk) as lat,
    (select g.long from geolocations g where g.nid = b.geolocation_fk) as long
  from blocks b join areas a on a.nid = b.area_fk`

// `routes/queries.ts` applyRouteFilters, one parameter each and null for off. Lists bind as JSON arrays.
const ROUTE_FILTERS = `where (?1 is null or r.region_fk = ?1)
  and (?2 is null or instr(r.area_ids, ?2) > 0)
  and (?3 is null or r.user_grade_fk >= ?3)
  and (?4 is null or r.user_grade_fk <= ?4)
  and (?5 is null or r.user_rating >= ?5)
  and (?6 is null or exists (select 1 from routes_to_tags t
    where t.route_fk = r.nid and t.tag_fk in (select value from json_each(?6))))
  and (?7 is null or exists (select 1 from routes_to_first_ascensionists rf
    where rf.route_fk = r.nid and rf.first_ascensionist_fk in (select value from json_each(?7))))
  and (?8 is null or exists (select 1 from topo_routes tr where tr.route_fk = r.nid))
  and (?9 is null
    or exists (select 1 from files f where f.route_fk = r.nid and f.bunny_stream_fk is not null)
    or exists (select 1 from ascents a join files f on f.ascent_fk = a.nid
      where a.route_fk = r.nid and a.deleted_at is null and f.bunny_stream_fk is not null))`

// The related rows `toRouteListItem` reads, already in Zero's camelCase shape. `json()` keeps a nested object an
// object: a subquery's result otherwise arrives as a string.
const ROUTE_TREE = `select r.*,
    (select json_group_array(json_object('tagFk', t.tag_fk) order by t.tag_fk)
      from routes_to_tags t where t.route_fk = r.nid) as tags,
    (select json_group_array(json_object('firstAscensionist', json((select json_object('name', fa.name, 'userFk', fa.user_fk)
        from first_ascensionists fa where fa.nid = rf.first_ascensionist_fk))) order by rf.nid)
      from routes_to_first_ascensionists rf where rf.route_fk = r.nid) as first_ascents,
    (select json_object('name', b.name, 'order', b."order",
        'area', json((select json_object('name', a.name) from areas a where a.nid = b.area_fk)))
      from blocks b where b.nid = r.block_fk) as block,
    (select json_group_array(json_object('path', tr.path, 'topo', json((select json_object('file',
        json((select json_object('height', f.height, 'path', f.path, 'width', f.width) from files f where f.id = tp.file_fk)))
        from topos tp where tp.nid = tr.topo_fk))) order by tr.nid)
      from topo_routes tr where tr.route_fk = r.nid) as topo_routes`

/** `listRoutes`: routes with their related rows, filtered as {@link ROUTE_FILTERS}. The caller appends the order. */
export const ROUTE_LIST_SQL = `${ROUTE_TREE} from routes r ${ROUTE_FILTERS}`

/** `listRoutes` by id: the ids (a JSON array) drive, so a route page reads one route, not the region. */
export const ROUTES_BY_ID_SQL = `${ROUTE_TREE} from json_each(?1) j join routes r on r.nid = j.value order by r.nid`

/** `listRoutesForMap`: the bare columns the map and its search read, filtered as {@link ROUTE_FILTERS}. */
export const ROUTE_MAP_SQL = `select r.nid as id, r.area_ids, r.block_fk, r.description, r.name, r.user_grade_fk
  from routes r ${ROUTE_FILTERS}`
