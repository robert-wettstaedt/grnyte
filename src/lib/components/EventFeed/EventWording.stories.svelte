<script module lang="ts">
  import { eventCard, type EventCardView } from '$lib/entities/event/card'
  import { EVENT_CASES } from '$lib/entities/event/cases/index'
  import type { EventObjectType } from '$lib/entities/event/dto'
  import { groupEvents } from '$lib/entities/event/grouping'
  import type { EventListItem } from '$lib/entities/event/mapper'
  import { overwriteGetLocale } from '$lib/paraglide/runtime'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import EventCard from './EventCard.svelte'
  import { PEOPLE } from './fixtures'

  type Locale = 'de' | 'en'

  // No `component`: a story here is a whole catalogue of cards, and the args (locale, whose
  // ascents these are) belong to the catalogue rather than to one EventCard.
  const { Story } = defineMeta({
    argTypes: {
      locale: { control: 'inline-radio', description: 'Locale to render the wording in.', options: ['en', 'de'] },
      owner: {
        control: 'inline-radio',
        description: "Whose ascent the ascent cards are about. A region admin may edit anyone's.",
        options: ['self', 'other'],
      },
    },
    parameters: { backgrounds: { value: 'root' }, layout: 'padded' },
    tags: ['autodocs'],
    title: 'Components/EventFeed/Wording',
  })

  /** A reader nobody in the fixtures is, so every card speaks in the third person. */
  const STRANGER = 99

  /** The name each object lends its headline, so `{name}` is never a placeholder. */
  const NAMES: Record<EventObjectType, string> = {
    area: 'Steinbruch',
    ascent: 'Rampe',
    block: 'Nordblock',
    file: 'Rampe',
    route: 'Kante',
    user: 'Mara Lindqvist',
  }

  /**
   * One event with its object flattened to a name and nothing else.
   *
   * The wall is about the SENTENCE, so everything a card would draw under it goes: no photos, no
   * notes, no conditions, and `row: 'none'` so no entity row either. What stays is what decides
   * which message is picked: the ascent type (the catalogue keys those on the value) and the
   * climber, whose id against the actor is what chooses the `owner=*` variant.
   *
   * An object that resolved to nothing stays nothing: those cards say their degraded sentence,
   * which is wording worth reading too.
   */
  const bare = (event: EventListItem, owner: 'other' | 'self'): EventListItem => {
    if (event.entity == null) {
      return event
    }

    const climberFk =
      event.entity.climberFk == null
        ? undefined
        : owner === 'self'
          ? event.actorFk
          : // Anybody but the actor, since "other" is decided by that comparison alone.
            event.actorFk === 5
            ? 3
            : 5

    return {
      ...event,
      entity: {
        ascentType: event.entity.ascentType,
        climberFk,
        climberName: climberFk == null ? undefined : PEOPLE[climberFk],
        crumbs: [],
        name: NAMES[event.objectType],
        row: 'none',
      },
      parentEntity:
        event.parent == null ? undefined : { crumbs: [], name: NAMES[event.parent.type], row: 'none' as const },
    }
  }

  /**
   * One card per sentence the feed can say, in the order the catalogue declares them.
   *
   * Read off `EVENT_CASES` and folded by the real `groupEvents`, so this is the same path the feed
   * runs and `cases/coverage.test.ts` is what keeps it complete: a mutation that starts writing a
   * new pair fails that test until it has a case, and the case shows up here the same day. Cards
   * are deduplicated by message key, since a sentence read twice teaches nothing.
   */
  const cardsFor = (owner: 'other' | 'self', yours: boolean): EventCardView[] => {
    // A list rather than a Set: this runs in a component module, where a mutable Set is a lint
    // error, and there are fewer than fifty keys to scan.
    const seen: string[] = []

    return EVENT_CASES.flatMap((entry) =>
      groupEvents(entry.events.map((event) => bare(event, owner)))
        .map((group) => eventCard(group, yours ? group.actorFk : STRANGER, entry.topos))
        .filter((card) => {
          if (seen.includes(card.headline.key)) {
            return false
          }

          seen.push(card.headline.key)
          return true
        }),
    )
  }
</script>

{#snippet template(args: { locale: Locale; owner: 'other' | 'self'; yours?: boolean })}
  <!-- Paraglide compiles messages to plain functions, so switching locale is switching what
       getLocale() returns before the cards render. Story-scoped: each render re-applies it. -->
  {@const localeApplied = overwriteGetLocale(() => args.locale)}
  {@const cards = cardsFor(args.owner, args.yours === true)}

  <div style="max-width: 560px; margin: 0 auto;" class="space-y-4" data-locale-applied={localeApplied === undefined}>
    {#each cards as card (card.id)}
      <div class="space-y-1">
        <!-- The key above the card it renders: a card that degraded past its own catalogue
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
<Story name="English, yours" args={{ locale: 'en', owner: 'self', yours: true }} {template} />

<!-- German puts the participle after the object, which is why each key holds a whole
     sentence rather than a verb fragment. This is where that pays off or does not. -->
<Story name="German" args={{ locale: 'de', owner: 'self' }} {template} />

<Story name="German, yours" args={{ locale: 'de', owner: 'self', yours: true }} {template} />
