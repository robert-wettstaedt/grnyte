<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import MediaDropZone from '$lib/components/MediaDropZone/MediaDropZone.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import FirstAscentField, { type FaClimber } from '$lib/entities/firstAscensionist/FirstAscentField.svelte'
  import GradeSlider from '$lib/entities/grade/GradeSlider.svelte'
  import { regionTags } from '$lib/entities/region/tagVocabulary'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { RemoteForm } from '@sveltejs/kit'
  import type { RouteDetail } from './dto'
  import RouteRatingInput from './RouteRatingInput.svelte'
  import type { RouteFormInput } from './routes.remote'
  import RouteTagsInput from './RouteTagsInput.svelte'

  // Shared body for the add/edit route forms. Every field is optional (one note up top says so
  // instead of per-field badges, hence `required` on each wrapper); the custom inputs are
  // self-sufficient (they render their own hidden inputs). Mirrors BlockFormFields.
  interface Props {
    /** The block the route lives on. */
    block: BlockDetail
    form: RemoteForm<RouteFormInput, unknown>
    /** When editing: the route, to seed the non-text fields once on mount. */
    route?: RouteDetail
    /** Media picked in the form, uploading in the background while the user types.
     *  The page finalizes them against the route once it exists. */
    uploads?: MediaUpload[]
  }

  let { block, form, route, uploads = $bindable([]) }: Props = $props()

  const global = getGlobalState()

  // Seeded once from the route on mount, deliberately: reading live data on every
  // change would clobber the user's edits (same rule as the pages' prefill effects).
  // svelte-ignore state_referenced_locally
  let gradeFk = $state(route?.rawGradeFk)
  // svelte-ignore state_referenced_locally
  let rating = $state(route?.rawRating ?? 0)
  // svelte-ignore state_referenced_locally
  let tags = $state([...(route?.tags ?? [])])
  // svelte-ignore state_referenced_locally
  let firstAscents = $state<FaClimber[]>(route?.firstAscents.map((fa) => ({ ...fa })) ?? [])

  // The Breadcrumb wants an area-shaped object; the block's `areas` is already the
  // full containment chain, and the block itself joins as the final label below.
  const breadcrumbArea = $derived({
    areas: block.areas,
    id: block.id,
    name: block.name,
    regionFk: block.regionFk,
    type: null,
  })

  // Newest first: recent years are the likely picks, so they sit at the top of the wheel.
  const years = Array.from({ length: new Date().getFullYear() - 1900 + 1 }, (_, i) =>
    String(new Date().getFullYear() - i),
  )

  const guideItems = [
    m.routes_form_ratingGuide1(),
    m.routes_form_ratingGuide2(),
    m.routes_form_ratingGuide3(),
    m.routes_form_ratingGuide4(),
    m.routes_form_ratingGuide5(),
  ]
</script>

<!-- Submitted values not typed directly: the block the route belongs to. -->
<input name="blockId" type="hidden" value={block.id} />

<!-- Present only when editing, the create form leaves `id` unset. -->
{#if form.fields.id.value() != null}
  <input type="hidden" {...form.fields.id.as('text')} />
{/if}

<div class="flex items-center gap-2 whitespace-nowrap">
  <Breadcrumb area={breadcrumbArea} userRegions={global.userRegions} />
  <span class="shrink-0 text-xs">·</span>
  <span class="shrink-0 text-xs font-semibold">{block.name}</span>
</div>

<p class="text-surface-600-400 flex items-start gap-2 text-sm">
  <span class="mt-1 flex-none"><Icon name="info" size={14} /></span>
  {m.routes_form_optionalNote()}
</p>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.name}
  hint={m.routes_form_nameHint()}
  id="route-name"
  label={m.routes_form_nameLabel()}
  required
>
  {#snippet children(props)}
    <input
      {...form.fields.name.as('text')}
      {...props}
      autocapitalize="words"
      autocomplete="off"
      class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-3.5 text-base font-semibold tracking-tight focus:ring-0 focus:outline-none"
      enterkeyhint="done"
      placeholder={m.routes_form_namePlaceholder()}
    />
  {/snippet}
</RemoteFormInputWrapper>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.gradeFk}
  hint={m.routes_form_gradeHint()}
  id="route-grade"
  label={m.routes_form_gradeLabel()}
  required
>
  <GradeSlider grades={global.grades} gradingScale={global.gradingScale} name="gradeFk" bind:value={gradeFk} />
</RemoteFormInputWrapper>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.rating}
  id="route-rating"
  label={m.routes_form_ratingLabel()}
  required
>
  <RouteRatingInput name="rating" bind:value={rating} />

  <details class="group">
    <summary
      class="text-surface-600-400 flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold select-none"
    >
      <span class="transition-transform group-open:rotate-90"><Icon name="chevron-right" size={13} /></span>
      {m.routes_form_ratingGuideTitle()}
    </summary>
    <div class="border-surface-300-700 bg-surface-100-900 mt-2 space-y-2 rounded-xl border px-4 py-3">
      <p class="text-surface-600-400 text-xs">{m.routes_form_ratingGuideIntro()}</p>
      {#each guideItems as item (item)}
        <p class="flex items-center gap-2.5 text-[13px]">
          <span class="bg-primary-400 size-1.25 flex-none rounded-full"></span>
          {item}
        </p>
      {/each}
    </div>
  </details>
</RemoteFormInputWrapper>

<RemoteFormInputWrapper
  class="space-y-1"
  field={form.fields.tags}
  id="route-tags"
  label={m.routes_form_tagsLabel()}
  required
>
  <RouteTagsInput name="tags" tags={regionTags(global.userRegions, block.regionFk)} bind:value={tags} />
</RemoteFormInputWrapper>

<RemoteFormInputWrapper
  class="space-y-2.5"
  field={form.fields.description}
  hint={m.routes_form_descriptionHint()}
  id="route-description"
  label={m.editor_descriptionLabel()}
  required
>
  {#snippet children(props)}
    <MarkdownEditor
      {...form.fields.description.as('text')}
      {...props}
      placeholder={m.editor_placeholder()}
      regionFk={block.regionFk}
    />
  {/snippet}
</RemoteFormInputWrapper>

<div class="space-y-4">
  <span class="text-surface-700-300 text-sm font-semibold">{m.routes_form_faLabel()}</span>

  <RemoteFormInputWrapper
    class="space-y-2.5"
    field={form.fields.firstAscentYear}
    hint={m.routes_form_faYearHint()}
    id="route-fa-year"
    label={m.routes_form_faYearLabel()}
    required
  >
    {#snippet children(props)}
      <!-- A select instead of a numeric input: on mobile it opens the year wheel. -->
      <select
        {...form.fields.firstAscentYear.as('select')}
        {...props}
        class="select border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-32 rounded-xl border px-4 py-3.5 font-mono text-base shadow-[none] focus:ring-0 focus:outline-none"
      >
        <option value="">—</option>
        {#each years as year (year)}
          <option value={year}>{year}</option>
        {/each}
      </select>
    {/snippet}
  </RemoteFormInputWrapper>

  <RemoteFormInputWrapper
    class="space-y-2.5"
    field={form.fields.firstAscensionists}
    hint={m.routes_form_faHint()}
    id="route-fa-climbers"
    label={m.routes_form_faClimbersLabel()}
    required
  >
    <FirstAscentField regionFk={block.regionFk} bind:value={firstAscents} />
  </RemoteFormInputWrapper>
</div>

<!-- Add only: an existing route takes new media on its detail page, where the media lives. -->
{#if route == null}
  <div class="space-y-2.5">
    <span class="text-surface-700-300 text-sm font-semibold">{m.routes_form_mediaLabel()}</span>
    <MediaDropZone accept={['image', 'video']} videoSource bind:uploads />
    <p class="text-surface-600-400 text-sm">{m.routes_form_mediaHint()}</p>
  </div>
{/if}
