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
    /** The location context: the parent (when creating a child) or the area itself (when editing). */
    area: AreaDetail
    form: RemoteForm<AreaFormInput, unknown>
  }

  const { area, form }: Props = $props()
  const global = getGlobalState()
</script>

<!-- Location trail for the area (or, when creating, the parent it will live under). -->
<Breadcrumb {area} includeSelf userRegions={global.userRegions} />

{#if form.fields.id.value() != null}
  <input type="hidden" {...form.fields.id.as('text')} />
{/if}

<RemoteFormInputWrapper
  class="space-y-2"
  field={form.fields.name}
  hint={m.areas_nameHint()}
  id="area-name"
  label={m.areas_namePlaceholder()}
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

{#if form.fields.parentFk.value() == null}
  <RemoteFormInputWrapper class="space-y-2" field={form.fields.regionFk} id="area-region" label={m.region_title()}>
    {#snippet children(props)}
      <select class="select" {...form.fields.regionFk.as('select')} {...props}>
        <option disabled value="">{m.region_select()}</option>
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
      regionFk={area.regionFk}
    />
  {/snippet}
</RemoteFormInputWrapper>
