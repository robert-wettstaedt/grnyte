<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import Disclosure from '$lib/components/Disclosure/Disclosure.svelte'
  import Icon from '$lib/components/Icon/Icon.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import MediaDropZone from '$lib/components/MediaDropZone/MediaDropZone.svelte'
  import type { BlockDetail } from '$lib/entities/block/dto'
  import type { MediaUpload } from '$lib/entities/file/upload-manager.svelte'
  import FirstAscentField, { type FaClimber } from '$lib/entities/firstAscensionist/FirstAscentField.svelte'
  import GradePicker from '$lib/entities/grade/GradePicker.svelte'
  import { regionTags } from '$lib/entities/region/tagVocabulary'
  import EditKeys from '$lib/forms/EditKeys.svelte'
  import FieldWrapper from '$lib/forms/FieldWrapper.svelte'
  import type { FormStore } from '$lib/forms/store.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { RouteDetail } from './dto'
  import type { RouteFormInput } from './dto'
  import RouteRatingInput from './RouteRatingInput.svelte'
  import RouteTagsInput from './RouteTagsInput.svelte'

  // Shared body for the add/edit route forms. Every field is optional (one note up top says so
  // instead of per-field badges, hence `required` on each wrapper). Mirrors BlockFormFields.
  interface Props {
    /** Off in the topo editor, which owns its own photo upload: two pickers on one surface
     *  would mean a photo of the rock and a photo of the climb look like the same thing. */
    allowMedia?: boolean
    /** The block the route lives on. */
    block: BlockDetail
    /** The four fields below live in this component and die with it. A caller that unmounts it
     *  mid-edit (the topo editor's two-step sheet) binds them to keep them; `undefined` means "not seeded yet". */
    firstAscents?: FaClimber[]
    form: FormStore<RouteFormInput, unknown>
    gradeFk?: number
    rating?: number
    /** When editing: the route, to seed the non-text fields once on mount. */
    route?: RouteDetail
    tags?: string[]
    /** Media picked in the form, uploading in the background while the user types.
     *  The page finalizes them against the route once it exists. */
    uploads?: MediaUpload[]
  }

  let {
    allowMedia = true,
    block,
    firstAscents = $bindable(),
    form,
    gradeFk = $bindable(),
    rating = $bindable(),
    route,
    tags = $bindable(),
    uploads = $bindable([]),
  }: Props = $props()

  const global = getGlobalState()

  // Seeded once at init, deliberately: reading live data on every change would clobber the user's
  // edits (same rule as the pages' prefill effects). An already-set value is a caller holding these
  // across a remount, so it wins over the route.
  // svelte-ignore state_referenced_locally
  const seed = route
  if (gradeFk === undefined) gradeFk = seed?.rawGradeFk
  if (rating === undefined) rating = seed?.rawRating ?? 0
  if (tags === undefined) tags = [...(seed?.tags ?? [])]
  if (firstAscents === undefined) firstAscents = seed?.firstAscents.map((fa) => ({ ...fa })) ?? []

  // Component state, not inputs, so the store gets these written into it.
  $effect(() => {
    form.fields.gradeFk.set(gradeFk == null ? '' : String(gradeFk))
    form.fields.rating.set(rating ? String(rating) : '')
    form.fields.tags.set([...(tags ?? [])])
    form.fields.firstAscensionists.set(
      (firstAscents ?? []).map(({ name, userFk }) => ({ name, userFk: userFk == null ? '' : String(userFk) })),
    )
  })

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

<input {...form.fields.blockId.as('hidden')} />

<EditKeys id={form.fields.id} known={form.fields.known} />

<div class="flex items-center gap-2 whitespace-nowrap">
  <Breadcrumb area={breadcrumbArea} userRegions={global.userRegions} />
  <span class="shrink-0 text-xs">·</span>
  <span class="shrink-0 text-xs font-semibold">{block.name}</span>
</div>

<p class="text-surface-600-400 flex items-start gap-2 text-sm">
  <span class="mt-1 flex-none"><Icon name="info" size={14} /></span>
  {m.routes_form_optionalNote()}
</p>

<FieldWrapper
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
</FieldWrapper>

<FieldWrapper
  class="space-y-2.5"
  field={form.fields.gradeFk}
  hint={m.routes_form_gradeHint()}
  id="route-grade"
  label={m.routes_form_gradeLabel()}
  required
>
  <GradePicker grades={global.grades} gradingScale={global.gradingScale} name="gradeFk" bind:value={gradeFk} />
</FieldWrapper>

<FieldWrapper
  class="space-y-2.5"
  field={form.fields.rating}
  id="route-rating"
  label={m.routes_form_ratingLabel()}
  required
>
  <RouteRatingInput name="rating" bind:value={rating} />

  <Disclosure
    panelClass="border-surface-300-700 bg-surface-100-900 mt-2 space-y-2 rounded-xl border px-4 py-3"
    summaryClass="text-surface-600-400 flex items-center gap-1.5 text-xs font-semibold"
  >
    {#snippet summary(open)}
      <span class={['transition-transform', open && 'rotate-90']}>
        <Icon name="chevron-right" size={13} />
      </span>
      {m.routes_form_ratingGuideTitle()}
    {/snippet}

    <p class="text-surface-600-400 text-xs">{m.routes_form_ratingGuideIntro()}</p>
    {#each guideItems as item (item)}
      <p class="flex items-center gap-2.5 text-[13px]">
        <span class="bg-primary-400 size-1.25 flex-none rounded-full"></span>
        {item}
      </p>
    {/each}
  </Disclosure>
</FieldWrapper>

<FieldWrapper class="space-y-1" field={form.fields.tags} id="route-tags" label={m.routes_form_tagsLabel()} required>
  <RouteTagsInput name="tags" tags={regionTags(global.userRegions, block.regionFk)} bind:value={tags} />
</FieldWrapper>

<FieldWrapper
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
</FieldWrapper>

<div class="space-y-4">
  <span class="text-surface-700-300 text-sm font-semibold">{m.routes_form_faLabel()}</span>

  <FieldWrapper
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
  </FieldWrapper>

  <FieldWrapper
    class="space-y-2.5"
    field={form.fields.firstAscensionists}
    hint={m.routes_form_faHint()}
    id="route-fa-climbers"
    label={m.routes_form_faClimbersLabel()}
    required
  >
    <FirstAscentField regionFk={block.regionFk} bind:value={firstAscents} />
  </FieldWrapper>
</div>

<!-- Add only: an existing route takes new media on its detail page, where the media lives. -->
{#if route == null && allowMedia}
  <div class="space-y-2.5">
    <span class="text-surface-700-300 text-sm font-semibold">{m.routes_form_mediaLabel()}</span>
    <MediaDropZone accept={['image', 'video']} videoSource bind:uploads />
    <p class="text-surface-600-400 text-sm">{m.routes_form_mediaHint()}</p>
  </div>
{/if}
