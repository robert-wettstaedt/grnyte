<script module lang="ts">
  import { toDisplayName } from '$lib/entities/displayName'
  import type { MediaFile } from '$lib/entities/file/dto'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import { ADMIN, MEMBER, USER } from '../../../../.storybook/regions'
  import AscentRow from './AscentRow.svelte'
  import type { RouteAscent } from './dto'

  // The row has two modes and they are almost different components: without `route` it is one
  // ascent on a route's page (avatar, author, date, media indented past the avatar), and with
  // `route` it is one row of the profile's logbook (no avatar, the route as the label, the day
  // header above it doing the dating). Most stories below exist to hold those two apart.
  //
  // Keep notes free of `!type:id!` references: those resolve through Zero, which Storybook does
  // not run. `deleteAscent` is a throwing stub here, so the delete dialog may be opened but not
  // confirmed. Times are relative to real now, because `formatDay` is.
  const DAY = 86_400_000
  const now = Date.now()

  const file = (id: string): MediaFile => ({
    ascentCreatedBy: undefined,
    bunnyStreamFk: undefined,
    createdAt: now - 3_600_000,
    height: 900,
    id,
    path: 'topo-sample.svg',
    regionFk: 1,
    source: undefined,
    uploader: undefined,
    visibility: 'public',
    width: 1200,
  })

  const files = (count: number) => Array.from({ length: count }, (_, i) => file(`f${i}`))

  const ascent: RouteAscent = {
    authorName: 'chalky',
    createdBy: 1,
    dateTime: now - 2 * DAY,
    files: [],
    gradeFk: 12,
    humidity: undefined,
    id: 1,
    notes: '',
    rating: 3,
    regionFk: 1,
    temperature: undefined,
    type: 'redpoint',
  }

  const base = { ascent, routeName: 'Arch Nemesis' } satisfies ComponentProps<typeof AscentRow>

  const NOTE = 'Sat start on the two crimps, then a long move to the sloper.'
  const LONG_NOTE =
    'Went back four times for this one. The **crux** is the second move off the sit start, ' +
    'which only works if you keep your hips low and trust the left heel. Conditions were ' +
    'finally cold enough on the last go, and the top out is easier than it looks from the ground.'

  const { Story } = defineMeta({
    args: base,
    argTypes: {
      expanded: { control: 'boolean', description: 'Expanded details: full note, conditions, actions.' },
      highlight: { control: 'boolean', description: "Primary-tinted framing for the reader's own row." },
    },
    component: AscentRow,
    parameters: {
      globalState: { user: USER, userRegions: MEMBER },
      layout: 'centered',
      width: 375,
    },
    tags: ['autodocs'],
    title: 'Entities/Ascent/AscentRow',
  })
</script>

<!-- Route-detail mode: the reader's own ascent on a route page. -->
<Story name="Default" />

<Story name="Flash" args={{ ascent: { ...ascent, type: 'flash' } }} />

<Story name="Attempt" args={{ ascent: { ...ascent, rating: undefined, type: 'attempt' } }} />

<Story name="Repeat" args={{ ascent: { ...ascent, type: 'repeat' } }} />

<!-- Nothing logged but the tick: the "-" grade pill and empty stars are deliberate, they nudge
     the climber to add an opinion. -->
<Story name="No grade or rating" args={{ ascent: { ...ascent, gradeFk: undefined, rating: undefined } }} />

<Story name="Highlighted" args={{ highlight: true }} />

<!-- The author row syncs in lazily, so an empty name renders as a skeleton rather than a
     blank circle and an empty link. -->
<Story name="Author loading" args={{ ascent: { ...ascent, authorName: '' } }} />

<Story name="With note" args={{ ascent: { ...ascent, notes: NOTE } }} />

<!-- Collapsed, a long note is clamped by Markdown's `short` class; expanded it renders in full. -->
<Story name="With long note" args={{ ascent: { ...ascent, notes: LONG_NOTE } }} />

<Story name="Expanded" args={{ ascent: { ...ascent, notes: LONG_NOTE }, expanded: true }} />

<!-- Conditions and the edit actions share one line, and the whole line goes when neither has
     anything to show. -->
<Story
  name="Expanded with conditions"
  args={{ ascent: { ...ascent, humidity: 62, notes: NOTE, temperature: 7 }, expanded: true }}
/>

<!-- Somebody else's ascent, read-only: no edit or delete, so the expanded row is note-only. -->
<Story
  name="Expanded, not mine"
  args={{ ascent: { ...ascent, authorName: 'gritstone', createdBy: 2, notes: NOTE }, expanded: true }}
/>

<!-- A region admin may delete anybody's, so the confirmation has to name the climber rather
     than assure them it is their own. `canEditAscent` grants this through ADMIN alone: a
     maintainer (READ+EDIT) sees the read-only row above. -->
<Story
  name="Expanded, admin on another climber"
  args={{ ascent: { ...ascent, authorName: 'gritstone', createdBy: 2, notes: NOTE }, expanded: true }}
  parameters={{ globalState: { user: USER, userRegions: ADMIN } }}
/>

<!-- Media strip. Three thumbs is the cap; the fourth becomes an overflow chip that jumps
     straight into the viewer. -->
<Story name="One photo" args={{ ascent: { ...ascent, files: files(1) } }} />

<Story name="Three photos" args={{ ascent: { ...ascent, files: files(3) } }} />

<Story name="Seven photos (overflow)" args={{ ascent: { ...ascent, files: files(7) } }} />

<!-- Expanding grows the thumbs and shows the full set. -->
<Story name="Expanded with photos" args={{ ascent: { ...ascent, files: files(7), notes: NOTE }, expanded: true }} />

<Story name="Note and photos" args={{ ascent: { ...ascent, files: files(3), notes: NOTE } }} />

<Story name="Long author name" args={{ ascent: { ...ascent, authorName: 'bouldering_enthusiast_1987' } }} />

<!-- Logbook mode: the profile's session list. The route replaces the author, the crumb sits
     above it, and the day header (not shown here) does the dating. -->
<Story name="Logbook" args={{ crumbs: 'Roadside · The Arch', route: { href: '#', name: 'Arch Nemesis' } }} />

<Story
  name="Logbook, long route name"
  args={{
    crumbs: 'Roadside · The Arch',
    route: { href: '#', name: 'The Impossible Traverse of the Northern Boulder' },
  }}
/>

<!-- A route may genuinely have no name. The placeholder comes from the mapper
     (`toDisplayName`), so the row never renders an empty link, which is what used to leave
     the ascent-type badge sitting alone on the first line. -->
<Story
  name="Logbook, unnamed route"
  args={{
    crumbs: 'Sub Area · blabla',
    route: { href: '#', name: toDisplayName('') },
    routeName: toDisplayName(''),
  }}
/>

<Story
  name="Logbook, long crumbs"
  args={{
    crumbs: 'Trois Pignons · Rocher des Potets · Secteur Nord-Est',
    route: { href: '#', name: 'Arch Nemesis' },
  }}
/>

<Story
  name="Logbook with photos"
  args={{
    ascent: { ...ascent, files: files(3) },
    crumbs: 'Roadside · The Arch',
    route: { href: '#', name: 'Arch Nemesis' },
  }}
/>

<Story
  name="Logbook, expanded"
  args={{
    ascent: { ...ascent, humidity: 62, notes: LONG_NOTE, temperature: 7 },
    crumbs: 'Roadside · The Arch',
    expanded: true,
    route: { href: '#', name: 'Arch Nemesis' },
  }}
/>

<!-- Everything at once, which is where the layout is most likely to come apart. Logbook
     mode, because `crumbs` is only ever passed together with `route`. -->
<Story
  name="Everything"
  args={{
    ascent: { ...ascent, files: files(7), humidity: 62, notes: LONG_NOTE, temperature: 7 },
    crumbs: 'Trois Pignons · Rocher des Potets · Secteur Nord-Est',
    expanded: true,
    highlight: true,
    route: { href: '#', name: 'The Impossible Traverse of the Northern Boulder' },
  }}
/>
