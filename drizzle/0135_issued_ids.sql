-- Whether a hard-delete Undo may reuse an id: only one its sequence already handed out. An id
-- beyond `last_value` would be taken from every region's future inserts, since the sequence is
-- global. The RLS role cannot read sequences, and a second connection from inside the handler's
-- transaction is the deadlock `pinnedTx` warns about, so a definer answers on the caller's.
--
-- A fixed list rather than a regclass argument, so it reveals nothing about any other table.
CREATE OR REPLACE FUNCTION public.id_was_issued(entity text, candidate bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  declare
    issued bigint;
  begin
    if entity not in ('areas', 'blocks', 'routes') then
      raise exception 'id_was_issued: unsupported entity %', entity using errcode = '22023';
    end if;
    issued := pg_catalog.pg_sequence_last_value(pg_catalog.pg_get_serial_sequence('public.' || entity, 'id')::regclass);
    return candidate > 0 and candidate <= coalesce(issued, 0);
  end;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION public.id_was_issued(text, bigint) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.id_was_issued(text, bigint) TO authenticated;
