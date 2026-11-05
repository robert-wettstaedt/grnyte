-- Topo lines whose route now sits on another block than the topo, left by hand-made moves before
-- the app could move a route. The block page already hides them; the route page still drew them.
DELETE FROM public.topo_routes tr
USING public.topos t, public.routes r
WHERE t.id = tr.topo_fk
  AND r.id = tr.route_fk
  AND t.block_fk IS DISTINCT FROM r.block_fk;
