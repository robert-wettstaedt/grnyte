<script lang="ts">
  import { resolve } from '$app/paths'
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import Markdown from '$lib/components/Markdown/Markdown.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import MediaGrid from '$lib/components/Media/MediaGrid.svelte'
  import MediaDropZone from '$lib/components/MediaDropZone/MediaDropZone.svelte'
  import { blockBreadcrumbArea } from '$lib/entities/block/breadcrumb'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import { getGradeBand } from '$lib/entities/grade/color'
  import GradeSlider from '$lib/entities/grade/GradeSlider.svelte'
  import { gradeLabel } from '$lib/entities/grade/label'
  import type { RouteDetail } from '$lib/entities/route/dto'
  import RouteGrade from '$lib/entities/route/RouteGrade.svelte'
  import RouteRatingInput from '$lib/entities/route/RouteRatingInput.svelte'
  import FormHint from '$lib/forms/FormHint.svelte'
  import OptionalBadge from '$lib/forms/OptionalBadge.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { localIsoDay } from '$lib/i18n/relativeTime'
  import { formatCelsius, formatConditions, formatHumidity } from '$lib/i18n/units.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getLocale } from '$lib/paraglide/runtime'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { RemoteForm } from '@sveltejs/kit'
  import type { AscentFormInput } from './ascents.remote'
  import AscentType from './AscentType.svelte'
  import AscentTypeInput from './AscentTypeInput.svelte'
  import ConditionSlider from './ConditionSlider.svelte'
  import type { AscentDetail } from './dto'
  import { routeAscentList } from './resources.svelte'

  // Shared body for the add/edit ascent forms. Field order follows the moment of
  // logging: the judgment cluster while it's fresh (type, grade, rating), then the
  // confirm-only date, low-priority conditions collapsed, free text, attachments.
  // The custom inputs are self-sufficient (they render their own hidden inputs),
  // same as the route form. Mirrors RouteFormFields.
  interface Props {
    /** When editing: the ascent, to seed the non-text fields once on mount. */
    ascent?: AscentDetail
    /** The route's block, framing the form (breadcrumb). */
    block: BlockDetail
    form: RemoteForm<AscentFormInput, unknown>
    /** The route being climbed. */
    route: RouteDetail
    /** Media picked in the add form, uploading in the background while the user types.
     *  The page finalizes them against the ascent once it exists. Editing attaches
     *  media directly instead (the ascent already exists). */
    uploads?: MediaUpload[]
  }

  let { ascent, block, form, route, uploads = $bindable([]) }: Props = $props()

  const global = getGlobalState()

  // Seeded once from the ascent on mount, deliberately: reading live data on every
  // change would clobber the user's edits (same rule as RouteFormFields).
  // svelte-ignore state_referenced_locally
  let type = $state(ascent?.type)
  // svelte-ignore state_referenced_locally
  let gradeFk = $state(ascent?.gradeFk)
  // svelte-ignore state_referenced_locally
  let rating = $state(ascent?.rating ?? 0)
  // svelte-ignore state_referenced_locally
  let temperature = $state(ascent?.temperature)
  // svelte-ignore state_referenced_locally
  let humidity = $state(ascent?.humidity)

  // Initial state only; <details> owns its open state after that.
  // svelte-ignore state_referenced_locally
  const conditionsOpen = temperature != null || humidity != null

  // Local calendar date (what "today" means to the climber, not UTC). These two are compared for
  // equality against the date input's value and one of them is submitted, so they go through the
  // explicit helper rather than a locale's date pattern; see `localIsoDay`.
  const now = new Date()
  const today = localIsoDay(now)
  // Calendar arithmetic (day 0 rolls into the previous month), so DST-safe.
  const yesterday = localIsoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  // The stored value is a plain pg date (synced as UTC-midnight millis), so UTC getters.
  // svelte-ignore state_referenced_locally
  let date = $state(ascent?.dateTime == null ? today : new Date(ascent.dateTime).toISOString().slice(0, 10))

  const breadcrumbArea = $derived(blockBreadcrumbArea(block))
  /** The native date input is the segment holding the selection (vs Today/Yesterday). */
  const customDate = $derived(date !== today && date !== yesterday)

  const segment = (active: boolean) => [
    'rounded-lg px-2 py-2 text-center',
    active ? 'preset-filled-primary-500' : 'hover:bg-surface-200-800',
  ]

  // The climber's own earlier notes on this route: projecting beta worth rereading
  // (and often re-logging) on the next session. Rides the already-synced
  // listRouteAscents rows, so this is a client-side filter, not a new query.
  const routeAscents = routeAscentList(() => route.id)
  const previousNotes = $derived(
    routeAscents.data
      .filter((prev) => prev.createdBy === global.user?.id && prev.notes.trim() !== '' && prev.id !== ascent?.id)
      .sort((a, b) => (b.dateTime ?? 0) - (a.dateTime ?? 0)),
  )

  const dateFormat = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'medium' })

  // Append rather than replace, so an insert can never clobber typed text. The
  // MarkdownEditor re-seeds itself on external field changes.
  const insertNote = (notes: string) => {
    const current = String(form.fields.notes.value() ?? '').trim()
    form.fields.notes.set(current === '' ? notes : `${current}\n\n${notes}`)
  }
</script>

<!-- Submitted values not typed directly: the route the ascent belongs to. -->
<input name="routeId" type="hidden" value={route.id} />

<!-- Present only when editing, the create form leaves `id` unset. -->
{#if ascent != null}
  <input name="id" type="hidden" value={ascent.id} />
{/if}

<div class="flex items-center gap-2 whitespace-nowrap">
  <Breadcrumb area={breadcrumbArea} userRegions={global.userRegions} />
  <span class="shrink-0 text-xs">·</span>
  <a
    class="anchor shrink-0 text-xs font-semibold"
    href={resolve('/(app)/(shell)/(explore)/(map)/blocks/[id]', { id: String(block.id) })}
  >
    {block.name}
  </a>
</div>

<!-- The route being logged, so the form never loses its subject. -->
<a
  class="border-surface-200-800 bg-surface-50-950 hover:bg-surface-100-900 flex items-center gap-3 rounded-2xl border px-3.5 py-3"
  href={resolve('/(app)/routes/[id]', { id: String(route.id) })}
>
  <RouteGrade
    band={getGradeBand(route.gradeFk)}
    grade={gradeLabel(global.grades, global.gradingScale, route.gradeFk)}
  />
  <span class="min-w-0 truncate text-sm font-semibold">{route.name}</span>
</a>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.type}
  id="ascent-type"
  label={m.ascents_form_typeLabel()}
  required
>
  <AscentTypeInput name="type" bind:value={type} />
</RemoteFormInputWrapper>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.gradeFk}
  hint={m.ascents_form_gradeHint()}
  id="ascent-grade"
  label={m.ascents_form_gradeLabel()}
>
  <GradeSlider grades={global.grades} gradingScale={global.gradingScale} name="gradeFk" bind:value={gradeFk} />
</RemoteFormInputWrapper>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.rating}
  id="ascent-rating"
  label={m.ascents_form_ratingLabel()}
>
  <RouteRatingInput name="rating" bind:value={rating} />
</RemoteFormInputWrapper>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.dateTime}
  id="ascent-date"
  label={m.ascents_form_dateLabel()}
  required
>
  {#snippet children(props)}
    <!-- One segmented control: the two everyday answers as segments, the native
         date input as the third so the long tail keeps the platform picker. The
         buttons flex, the input keeps its intrinsic width so the value never clips. -->
    <div class="border-surface-300-700 bg-surface-100-900 flex gap-1 rounded-xl border p-1 text-sm font-semibold">
      <button class={['flex-1', ...segment(date === today)]} onclick={() => (date = today)} type="button">
        {m.ascents_form_dateToday()}
      </button>
      <button class={['flex-1', ...segment(date === yesterday)]} onclick={() => (date = yesterday)} type="button">
        {m.ascents_form_dateYesterday()}
      </button>
      <!-- When inactive, bg-transparent kills the UA's field background so the input
           reads as a segment (app.html's color-scheme keeps the picker on the theme).
           When active it must stay off: it would also kill the preset's primary fill,
           leaving the preset's dark on-primary text on the dark surface. -->
      <input
        {...props}
        class={[
          ...segment(customDate),
          !customDate && 'bg-transparent',
          'flex-none appearance-none font-mono focus:outline-none',
        ]}
        max={today}
        name="dateTime"
        required
        type="date"
        bind:value={date}
      />
    </div>
  {/snippet}
</RemoteFormInputWrapper>

<details class="group" open={conditionsOpen}>
  <summary class="flex cursor-pointer list-none items-center gap-2 select-none">
    <span class="text-surface-700-300 text-sm font-semibold">{m.ascents_form_conditionsLabel()}</span>
    <OptionalBadge />
    <span class="flex-1"></span>
    {#if temperature != null || humidity != null}
      <span class="text-surface-600-400 font-mono text-xs font-bold">
        {formatConditions(temperature, humidity)}
      </span>
    {/if}
    <span class="text-surface-500 transition-transform group-open:rotate-90">
      <Icon name="chevron-right" size={14} />
    </span>
  </summary>

  <div class="mt-3 space-y-3">
    <!-- ponytail: the slider steps in whole °C even for imperial locales (display-only
         conversion); a °F-native track needs a unit setting first. -->
    <ConditionSlider
      format={formatCelsius}
      label={m.ascents_form_temperatureLabel()}
      max={40}
      min={-10}
      name="temperature"
      bind:value={temperature}
    />
    <FormHint id="ascent-temperature" issues={form.fields.temperature.issues()} />

    <ConditionSlider
      format={formatHumidity}
      label={m.ascents_form_humidityLabel()}
      max={100}
      min={0}
      name="humidity"
      step={5}
      bind:value={humidity}
    />
    <FormHint id="ascent-humidity" issues={form.fields.humidity.issues()} />

    <p class="text-surface-600-400 pt-1 text-sm">{m.ascents_form_conditionsHint()}</p>
  </div>
</details>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.notes}
  hint={m.ascents_form_notesHint()}
  id="ascent-notes"
  label={m.ascents_form_notesLabel()}
>
  {#snippet children(props)}
    <MarkdownEditor
      {...form.fields.notes.as('text')}
      {...props}
      placeholder={m.editor_placeholder()}
      regionFk={route.regionFk}
    />

    {#if previousNotes.length > 0}
      <details class="group">
        <summary
          class="text-surface-600-400 flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold select-none"
        >
          <span class="transition-transform group-open:rotate-90"><Icon name="chevron-right" size={13} /></span>
          {m.ascents_form_previousNotes()} ({previousNotes.length})
        </summary>

        <div class="mt-2 space-y-2">
          {#each previousNotes as prev (prev.id)}
            <div class="border-surface-200-800 bg-surface-50-950 space-y-2 rounded-xl border px-3.5 py-3">
              <div class="flex items-center gap-2">
                <AscentType status={prev.type} />
                {#if prev.dateTime != null}
                  <span class="text-surface-600-400 text-xs font-semibold">{dateFormat.format(prev.dateTime)}</span>
                {/if}
                <span class="flex-1"></span>
                <button class="btn btn-sm preset-tonal-surface" onclick={() => insertNote(prev.notes)} type="button">
                  {m.ascents_form_insertNote()}
                </button>
              </div>
              <div class="text-sm">
                <Markdown markdown={prev.notes} />
              </div>
            </div>
          {/each}
        </div>
      </details>
    {/if}
  {/snippet}
</RemoteFormInputWrapper>

<div class="space-y-2.5">
  <span class="text-surface-700-300 text-sm font-semibold">{m.routes_form_mediaLabel()}</span>
  {#if ascent == null}
    <MediaDropZone accept={['image', 'video']} bind:uploads />
  {:else}
    <MediaGrid canEdit compact items={ascent.files} shareText={route.name} target={{ id: ascent.id, type: 'ascent' }} />
  {/if}
  <p class="text-surface-600-400 text-sm">{m.ascents_form_mediaHint()}</p>
</div>
