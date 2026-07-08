---
name: add-i18n-keys
description: Add or edit i18n message keys in this app (Paraglide JS). Use whenever introducing user-facing copy, aria-labels, toast titles, or button text that needs a translation key, or when the user says "add a label/string/translation" or "wire up the copy". Enforces both locales, key naming, reuse, and the no-em-dash rule.
---

# Add i18n message keys (Paraglide)

User-facing strings are Paraglide messages, accessed as `import { m } from '$lib/paraglide/messages'`
→ `m.some_key()`. Never hard-code display text in components.

## Rules

- **Two locales, both required:** add the key to **both** `messages/en.json` **and** `messages/de.json`.
  A key present in only one locale is a bug.
- **Naming:** `domain_camelCase` (e.g. `media_makePrivate`, `share_copyLink`, `common_close`). Group
  by domain prefix; place the key alphabetically within the file (keys are kept sorted).
- **Reuse first:** grep existing keys before adding — `common_*` already covers close/delete/cancel/save/
  comingSoon/playVideo, etc. Don't add a near-duplicate.
- **No em-dashes** in any copy (or anywhere) — use a period, comma, or parentheses. Standing style rule.
- Keep aria-labels real keys too (accessibility), not literals.

## Steps

1. Pick/confirm the `domain_camelCase` key name; check it doesn't already exist in `messages/en.json`.
2. Add it to `messages/en.json` and `messages/de.json` at the matching alphabetical position, with a
   real translation in each (write the German, or run `npm run machine-translate` to fill from the
   English source).
3. Use it in the component as `m.the_key()`.
4. `npm run check` — a missing/renamed key fails the build, which is the safety net.

## Example

```jsonc
// messages/en.json                     // messages/de.json
"media_makePrivate": "Make private",    "media_makePrivate": "Privat machen",
"media_makePublic": "Make public",      "media_makePublic": "Öffentlich machen",
```
