<script lang="ts">
  import { pageState } from '$lib/components/Layout'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import type { Row } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'
  import AreaTypeFormField from './AreaTypeFormField.svelte'

  type Props = Partial<Row<'areas'>>

  let {
    description = $bindable(),
    id,
    name = $bindable(),
    parentFk,
    regionFk = $bindable(),
    type = $bindable(),
  }: Props = $props()

  const { t } = getI18n()
  let adminRegions = $derived(pageState.userRegions.filter((region) => region.role === 'region_admin'))
</script>

{#if id != null}
  <input type="hidden" name="id" value={id} />
{/if}

<fieldset class="card preset-filled-surface-100-900 relative mx-2 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.basics')}
  </legend>

  <label class="label">
    <span>{t('common.name')}</span>
    <input class="input" name="name" type="text" placeholder={t('common.enterName')} bind:value={name} />
  </label>

  <hr class="text-surface-200-800 -mx-3 mt-4" />

  {#if parentFk}
    <AreaTypeFormField bind:value={type} />

    <input type="hidden" name="parentFk" value={parentFk ?? ''} />
    <input type="hidden" name="regionFk" value={regionFk ?? ''} />
  {:else}
    <label class="label mt-4">
      <span>{t('common.region')}</span>
      <select
        class="select"
        name="regionFk"
        onchange={(event) => {
          const value = Number(event.currentTarget.value)
          regionFk = Number.isNaN(value) ? undefined : value
        }}
        value={adminRegions.length === 1 ? adminRegions[0].regionFk : (regionFk ?? '')}
      >
        <option disabled value="">{t('common.selectRegion')}</option>
        {#each adminRegions as region}
          <option value={region.regionFk}>{region.name}</option>
        {/each}
      </select>
    </label>
  {/if}
</fieldset>

<fieldset class="card preset-filled-surface-100-900 relative mx-2 mt-16 p-3 md:mx-0">
  <legend class="text-surface-700-300 absolute -top-8 text-xs font-extrabold uppercase">
    {t('common.description')}
  </legend>

  <textarea hidden name="description" value={description ?? ''}></textarea>

  <MarkdownEditor bind:value={description} />
</fieldset>
