// Raw statements over the local database, each held to an index by `explain.server.test.ts`.

// The explore map's block rows. Never a LEFT JOIN through PowerSync's views: SQLite cannot use the index through
// them and scans (6 s here); an inner join and correlated subqueries both search the index.
export const MAP_SQL = `select b.nid as id, b.name, b.grade_counts, a.nid as area_id, a.name as area_name, a.parent_fk,
    (select g.lat from geolocations g where g.nid = b.geolocation_fk) as lat,
    (select g.long from geolocations g where g.nid = b.geolocation_fk) as long
  from blocks b join areas a on a.nid = b.area_fk`
