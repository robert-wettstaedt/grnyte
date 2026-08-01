-- The ascent type `send` became `redpoint`: the strict "worked it, then sent it"
-- type that sits next to `flash` and `repeat`. "Send" is now the umbrella for all
-- three, which is what `stats.sends` has always counted. See CONTEXT.md.
--
-- `ascents.type` is plain `text` with a TypeScript-only enum, so there is no DDL
-- here, only data. Hand-written: `drizzle-kit generate` sees no schema diff.
UPDATE "ascents" SET "type" = 'redpoint' WHERE "type" = 'send';
