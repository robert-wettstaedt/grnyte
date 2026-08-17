<script module lang="ts">
  import { groupCatalogueRows } from '$lib/entities/event/cardGroup'
  import type { CatalogueEntityType } from '$lib/entities/event/catalogue'
  import { eventEntityKey, type EventEntity } from '$lib/entities/event/entity'
  import { WRITTEN_ROWS } from '$lib/entities/event/verbs'
  import { overwriteGetLocale } from '$lib/paraglide/runtime'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import EventCard from './EventCard.svelte'
  import { activity, view } from './fixtures'

  type Locale = 'de' | 'en'

  // No `component`: a story here is a whole catalogue of cards, and the args (locale, whose
  // rows these are) belong to the catalogue rather than to one EventCard.
  const { Story } = defineMeta({
    argTypes: {
      locale: { control: 'inline-radio', description: 'Locale to render the wording in.', options: ['en', 'de'] },
      owner: {
        control: 'inline-radio',
        description: "Whose ascent the ascent rows are about. A region admin may edit anyone's.",
        options: ['self', 'other'],
      },
    },
    parameters: { backgrounds: { value: 'root' }, layout: 'padded' },
    tags: ['autodocs'],
    title: 'Components/EventFeed/Wording',
  })

  const ACTOR = 4
  const OTHER_CLIMBER = 5

  /** The name each entity kind lends its headline, so `{name}` is never a placeholder. */
  const NAMES: Record<CatalogueEntityType, string> = {
    area: 'Steinbruch',
    ascent: 'Rampe',
    block: 'Nordblock',
    file: 'Rampe',
    route: 'Kante',
    user: 'Mara Lindqvist',
  }

  // One basic card per written triple: no photos, no notes, and `row: 'none'` so nothing
  // renders below the headline. The list is the same catalogue verbs.test.ts asserts
  // against, so a new activity kind shows up here the moment a mutation starts writing it.
  const cardsFor = (owner: 'other' | 'self', currentUserFk: number | undefined) =>
    WRITTEN_ROWS.map((partial, index) => {
      // An invitation names the invitee, who has no user row yet, only the address the
      // inviter typed. Anything else here would flatter the copy.
      const invitation = partial.columnName === 'invitation' ? { newValue: 'sofia.brandt@example.com' } : {}
      const row = activity(index * 3, { ...partial, ...invitation, entityId: String(index), userFk: ACTOR })

      const climberFk = owner === 'self' ? ACTOR : OTHER_CLIMBER
      const entity: EventEntity = {
        climberFk,
        climberName: climberFk === ACTOR ? 'Jonas Weber' : 'Mara Lindqvist',
        name: NAMES[row.entityType],
        row: 'none',
      }
      const key = eventEntityKey({ id: row.entityId, type: row.entityType })

      return view(groupCatalogueRows([row])[0], new Map([[key, entity]]), currentUserFk)
    })
</script>

{#snippet template(args: { currentUserFk?: number; locale: Locale; owner: 'other' | 'self' })}
  <!-- Paraglide compiles messages to plain functions, so switching locale is switching what
       getLocale() returns before the cards render. Story-scoped: each render re-applies it. -->
  {@const localeApplied = overwriteGetLocale(() => args.locale)}
  {@const cards = cardsFor(args.owner, args.currentUserFk)}

  <div style="max-width: 560px; margin: 0 auto;" class="space-y-4" data-locale-applied={localeApplied === undefined}>
    {#each cards as card (card.id)}
      <div class="space-y-1">
        <!-- The key above the card it renders: a row that degraded past its own catalogue
             entry to a vaguer verb is exactly what this catalogue exists to catch. -->
        <p class="text-surface-600-400 font-mono text-[11px]">{card.headline.key}</p>
        <EventCard view={card} />
      </div>
    {/each}
  </div>
{/snippet}

<!-- Somebody else did it: the `person=*` variant of every message. Flip the `owner` control
     to read the wording for an admin editing another climber's ascent. -->
<Story name="English" args={{ locale: 'en', owner: 'self' }} {template} />

<!-- Your own rows: the `person=self` variant ("You added the area Steinbruch"). -->
<Story name="English, yours" args={{ currentUserFk: 4, locale: 'en', owner: 'self' }} {template} />

<!-- German puts the participle after the object, which is why each key holds a whole
     sentence rather than a verb fragment. This is where that pays off or does not. -->
<Story name="German" args={{ locale: 'de', owner: 'self' }} {template} />

<Story name="German, yours" args={{ currentUserFk: 4, locale: 'de', owner: 'self' }} {template} />
