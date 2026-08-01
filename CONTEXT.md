# grnyte domain vocabulary

A private guidebook and logbook for bouldering. This file is the vocabulary guardrail:
read it before writing user-facing copy, i18n keys, or naming anything in the domain.
It records distinctions the code depends on, not a style preference.

## Hierarchy

```
region > area (nests via parentFk) > block > route > ascent
```

Every level also carries `regionFk` directly, denormalised for RLS.

## Terms

**crag**
An area of type `'crag'` (`areaTypeEnum: ['area', 'crag']`): the leaf kind that holds
blocks. A crag _is_ an area, not a separate entity, so "crag" in the UI is correct and
must not be flattened to "area". Parking needs a real crag; blocks also accept a
still-untyped area.

**block**
The entity. In prose the physical rock is a "boulder", which is correct English and used
deliberately in landing copy. Never call the record a boulder.

**route**
The entity. Bouldering colloquially says "problem"; grnyte does not. Route everywhere.

**send**
The umbrella for a successful ascent: `flash`, `redpoint` or `repeat`. Anything that is
not an `attempt`. This is what `stats.sends` counts and what the profile header means by
"Sends". It is deliberately _not_ a value in `ascentTypeEnum`, because one word cannot be
both the umbrella and one of the things under it. KAYA and 8a.nu split it the same way.
Do not reintroduce "tick" or "ticked" as a third word for this; use sent.

**redpoint**
The strict ascent type: sent it, having needed more than one go. Sits next to `flash`
(first try) and `repeat` (done it before). Borrowed from sport climbing, as every serious
bouldering logbook also does, because bouldering has no native word for it. The German
label stays "Durchstieg"; the enum value does not oblige the copy.

**community**
The people in a region. Never crew, team or squad.
