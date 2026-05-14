# Copilot Instructions For This Repository

## i18n Is Mandatory For User-Facing Text

This project uses i18n. Do not hardcode user-visible text.

1. Always render user-facing text with the project translation function (for example `t(...)` from `getI18n()`).
2. Before adding a new translation key, search existing keys in both locale files:
   - `src/lib/i18n/locales/en.json`
   - `src/lib/i18n/locales/de.json`
3. Reuse existing keys whenever possible.
4. Only add a new key when no suitable key already exists.
5. Any new key must be added to both locale files with matching paths.
6. Follow existing naming conventions and namespaces (`common.*`, `nav.*`, feature groups).

## Skeleton Is The Design Framework

This project uses Skeleton for Svelte as the design framework.

1. Prefer Skeleton design system patterns, utility classes, and components for UI work.
2. For framework components, use the Skeleton Svelte package (`@skeletonlabs/skeleton-svelte`) patterns.
3. Keep styling aligned with Skeleton + Tailwind conventions; avoid introducing conflicting design systems.
4. If mixing UI libraries, only use compatible/headless options and keep Skeleton as the visual system of record.
5. Do not introduce unsupported overlapping UI kits such as DaisyUI or Flowbite for this project.
6. Check Skeleton docs before major UI changes:
   - https://www.skeleton.dev/llms-svelte.txt
   - https://www.skeleton.dev/docs/svelte/get-started/introduction
