// Raw statements over the local database, each held to an index by `explain.server.test.ts`.

// The explore map's block rows, with the area and parent `toBlockDetail` reads. Never a LEFT JOIN through PowerSync's
// views: SQLite cannot use the index through them and scans (6 s here); correlated subqueries search the index.
export const MAP_SQL = `select b.*,
    (select json_object('id', a.nid, 'name', a.name, 'type', a.type,
        'parent', json((select json_object('id', p.nid, 'name', p.name, 'type', p.type) from areas p where p.nid = a.parent_fk)))
      from areas a where a.nid = b.area_fk) as area,
    (select json_object('estimated', g.estimated, 'nid', g.nid, 'lat', g.lat, 'long', g.long)
      from geolocations g where g.nid = b.geolocation_fk) as geolocation
  from blocks b order by b.name, b.nid`

// Every area with two levels of parents and its parking: the map's and the pickers' area rows.
export const AREA_MAP_SQL = `select a.*,
    (select json_object('id', p.nid, 'name', p.name, 'type', p.type,
        'parent', json((select json_object('id', pp.nid, 'name', pp.name, 'type', pp.type) from areas pp where pp.nid = p.parent_fk)))
      from areas p where p.nid = a.parent_fk) as parent,
    (select json_group_array(json_object('area_fk', g.area_fk, 'block_fk', g.block_fk, 'estimated', g.estimated,
        'lat', g.lat, 'long', g.long, 'nid', g.nid, 'region_fk', g.region_fk) order by g.nid)
      from geolocations g where g.area_fk = a.nid) as parking
  from areas a order by a.name, a.nid`

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
export const ROUTES_BY_ID_SQL = `${ROUTE_TREE} from (select distinct value from json_each(?1)) j join routes r on r.nid = j.value order by r.nid`

/** `listRoutesForMap`: the bare columns the map and its search read, filtered as {@link ROUTE_FILTERS}. */
export const ROUTE_MAP_SQL = `select r.nid as id, r.area_ids, r.block_fk, r.description, r.name, r.user_grade_fk
  from routes r ${ROUTE_FILTERS}`
