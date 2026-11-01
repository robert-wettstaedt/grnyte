-- Seed `blocks.grade_counts` for the routes written before 0143's trigger existed. Its own migration (as 0115): a
-- statement appended to a file that already ran is never executed.
SELECT public.recount_block_grade_counts(array_agg(id)) FROM public.blocks;
