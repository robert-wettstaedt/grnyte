<script lang="ts">
  import Breadcrumb from '$lib/components/Breadcrumb/Breadcrumb.svelte'
  import MarkdownEditor from '$lib/components/MarkdownEditor/MarkdownEditor.svelte'
  import RemoteFormInputWrapper from '$lib/forms/RemoteFormInputWrapper.svelte'
  import { m } from '$lib/paraglide/messages'
  import { getGlobalState } from '$lib/state/global.svelte'
  import type { RemoteForm } from '@sveltejs/kit'
  import type { AreaFormInput } from './areas.remote'
  import type { AreaDetail } from './dto'
  import { canAddArea } from './permissions'

  // Shared field set for the create and edit area forms; the surrounding chrome lives in FormScaffold.
  interface Props {
    /** The location context: the parent (when creating a child) or the area itself (when editing).
     *  Absent when creating a top-level area, which has no parent to sit under, so the region
     *  select below is the whole of its placement. */
    area?: AreaDetail
    form: RemoteForm<AreaFormInput, unknown>
  }

  const { area, form }: Props = $props()
  const global = getGlobalState()

  // Scopes the description editor's entity references. Falls back to the region picked in the
  // select, which is the only source a top-level area has; 0 until something is picked, which
  // just means the reference search finds nothing yet.
  const regionFk = $derived(area?.regionFk ?? Number(form.fields.regionFk.value() ?? 0))
</script>

{#if area != null}
  <!-- Location trail for the parent the new area will live under (or the area being edited). -->
  <Breadcrumb {area} includeSelf userRegions={global.userRegions} />
{/if}

{#if form.fields.id.value() != null}
  <input type="hidden" {...form.fields.id.as('text')} />
{/if}

<RemoteFormInputWrapper
  class="space-y-2"
  field={form.fields.name}
  hint={m.areas_nameHint()}
  id="area-name"
  label={m.areas_namePlaceholder()}
  required
>
  {#snippet children(props)}
    <input
      {...form.fields.name.as('text')}
      {...props}
      {@attach (node) => node.focus()}
      autocapitalize="words"
      autocomplete="off"
      class="border-surface-300-700 bg-surface-100-900 focus:border-primary-500 mb-2 w-full rounded-xl border px-4 py-3 text-base font-semibold tracking-tight focus:ring-0 focus:outline-none"
      enterkeyhint="next"
      placeholder={m.areas_namePlaceholder()}
    />
  {/snippet}
</RemoteFormInputWrapper>

{#if form.fields.id.value() == null && form.fields.parentFk.value() == null}
  <!-- Creating a top-level area, and only then. `required`, or the wrapper badges it "optional": a
       top-level area has no parent to inherit a region from, so this select is the whole of its
       placement.

       Never on the edit form. `updateArea` writes `description` and `name` and nothing else, so an
       area being edited took the same branch (its prefilled `parentFk` is undefined when it is
       top-level) and offered a region move that was then dropped on the floor, answered with the
       same redirect a real edit gets. Moving an area between regions is not a rename: it would have
       to carry the subtree and gate on both regions. -->
  <RemoteFormInputWrapper
    class="space-y-2"
    field={form.fields.regionFk}
    id="area-region"
    label={m.region_title()}
    required
  >
    {#snippet children(props)}
      <!-- Sized to match the name input above it, not the default `select` metrics: on the
           top-level form these two sit directly under each other and the mismatch shows. -->
      <select
        class="select border-surface-300-700 bg-surface-100-900 focus:border-primary-500 w-full rounded-xl border px-4 py-3 text-base focus:ring-0 focus:outline-none"
        {...form.fields.regionFk.as('select')}
        {...props}
      >
        <!-- Not `disabled`: a disabled option cannot be selected, so with nothing preselected the
             browser showed an empty box instead of the prompt. Submitting it blank is still
             refused, by the schema rather than by hiding the option. -->
        <option value="">{m.region_select()}</option>
        {#each global.userRegions as region (region.regionFk)}
          <option
            disabled={!canAddArea(global.userRegions, { regionFk: region.regionFk, type: 'area' })}
            value={String(region.regionFk)}
          >
            {region.name}
          </option>
        {/each}
      </select>
    {/snippet}
  </RemoteFormInputWrapper>
{:else}
  <input type="hidden" {...form.fields.parentFk.as('text')} />
  <input type="hidden" {...form.fields.regionFk.as('text')} />
{/if}

<RemoteFormInputWrapper
  class="space-y-2"
  field={form.fields.description}
  hint={m.editor_descriptionHint()}
  id="area-description"
  label={m.editor_descriptionLabel()}
>
  {#snippet children(props)}
    <MarkdownEditor
      {...form.fields.description.as('text')}
      {...props}
      placeholder={m.editor_placeholder()}
      {regionFk}
    />
  {/snippet}
</RemoteFormInputWrapper>
