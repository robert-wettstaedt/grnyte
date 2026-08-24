DROP INDEX "activities_notified_idx";--> statement-breakpoint
ALTER TABLE "activities" DROP COLUMN "notified";--> statement-breakpoint
-- `lang` was 1.0's only record of which language to write to a person in, and 2.0 reads
-- `user_settings.contact_locale` instead, which nothing has ever filled for these accounts. Seed it
-- from the newest subscription per user before the column goes, or every German account comes back
-- to English push and English invite mail. Only where nothing is set yet, so an explicit pick wins,
-- and only for locales the app still ships. This is a seed from the best available signal, the same
-- thing signup does with the request locale, not a claim that the person chose it.
UPDATE "user_settings" s SET "contact_locale" = p."lang"
FROM (
  SELECT DISTINCT ON ("user_fk") "user_fk", "lang"
  FROM "push_subscriptions"
  WHERE "lang" IN ('en', 'de')
  ORDER BY "user_fk", "id" DESC
) p
WHERE s."user_fk" = p."user_fk" AND s."contact_locale" IS NULL;--> statement-breakpoint
ALTER TABLE "push_subscriptions" DROP COLUMN "lang";--> statement-breakpoint
-- The three settings below are renames, not removals: notify_new_ascents is notify_ascents,
-- notify_moderations is notify_guidebook_edits, notify_new_users is notify_community. Carry the stored
-- choice across before dropping the old columns, or everyone who muted a channel in 1.0 comes back
-- to 2.0 with it switched on again, since the new columns default true.
--
-- All-false is ambiguous: the old columns defaulted false, so it is both the untouched state of
-- somebody who never used push and the state of somebody who deliberately muted every channel.
-- Owning a device is what tells them apart. A row with a push subscription made a choice and it is
-- copied whatever it says; a row without one never opted in, and keeps the 2.0 defaults, where
-- granting the browser its push permission is the opt-in. notify_directed has no 1.0 counterpart
-- and keeps its default either way.
UPDATE "user_settings" SET
  "notify_ascents" = "notify_new_ascents",
  "notify_guidebook_edits" = "notify_moderations",
  "notify_community" = "notify_new_users"
WHERE "notify_new_ascents" OR "notify_moderations" OR "notify_new_users"
  OR EXISTS (SELECT 1 FROM "push_subscriptions" p WHERE p."user_fk" = "user_settings"."user_fk");--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "notify_moderations";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "notify_new_ascents";--> statement-breakpoint
ALTER TABLE "user_settings" DROP COLUMN "notify_new_users";