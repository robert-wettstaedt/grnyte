<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { checkRegionPermission, REGION_PERMISSION_DELETE, REGION_PERMISSION_EDIT } from '$lib/auth'
  import FormAppBar from '$lib/components/AppBar/FormAppBar.svelte'
  import DangerZone from '$lib/components/DangerZone'
  import { pageState } from '$lib/components/Layout'
  import { getBlockContext } from '$lib/contexts/block'
  import { enhanceForm } from '$lib/forms/enhance.svelte'
  import { getBlockName } from '$lib/helper.svelte'
  import { getI18n } from '$lib/i18n'
  import BlockFormFields from '../../../BlockFormFields'
  import { deleteBlock, updateBlock } from './page.remote'

  const { block } = getBlockContext()
  const { t } = getI18n()
  let form = $state<HTMLFormElement>()

  $effect(() => {
    updateBlock.fields.set({
      areaId: String(block.areaFk),
      blockId: String(block.id),
      name: block.name,
    })
  })

  $inspect(updateBlock.fields.allIssues())
</script>

<svelte:head>
  <title>
    {t('blocks.editBlockOfTitle', { name: getBlockName(block) })} - {PUBLIC_APPLICATION_NAME}
  </title>
</svelte:head>

<FormAppBar
  {form}
  backRoute={resolve('/(new)/bla/(modal)/blocks/[id]', { id: block.id.toString() })}
  title={t('blocks.editBlock')}
  subtitle={block.area == null ? undefined : `${t('common.in')} ${block.area.name}`}
  pending={updateBlock.pending}
/>

<div class="m-auto flex flex-col items-center py-16 md:max-w-xl">
  <form bind:this={form} class="w-full" {...updateBlock.enhance(enhanceForm())}>
    <input type="hidden" {...updateBlock.fields.blockId.as('text')} />

    <BlockFormFields fields={updateBlock.fields} />
  </form>

  {#if checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_DELETE], block.regionFk) || (checkRegionPermission(pageState.userRegions, [REGION_PERMISSION_EDIT], block.regionFk) && block.createdBy === pageState.user?.id)}
    <div class="w-full px-3 md:px-0">
      <DangerZone name={t('entities.block')} onDelete={() => (block.id == null ? undefined : deleteBlock(block.id))} />
    </div>
  {/if}
</div>
