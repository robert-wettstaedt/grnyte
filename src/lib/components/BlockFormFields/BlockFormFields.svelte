<script lang="ts">
  import FileUpload, { type FileUploadProps } from '$lib/components/FileUpload'
  import type { Row } from '$lib/db/zero'
  import { getI18n } from '$lib/i18n'

  interface Props {
    areaFk: Row<'blocks'>['areaFk'] | undefined | null
    blockId?: Row<'blocks'>['id'] | undefined | null
    name: Row<'blocks'>['name'] | undefined | null
    fileUploadProps?: FileUploadProps
  }

  let { areaFk, blockId, name = $bindable(), fileUploadProps }: Props = $props()

  const { t } = $derived(getI18n())
</script>

{#if areaFk != null}
  <input type="hidden" name="areaId" value={areaFk} />
{/if}

{#if blockId != null}
  <input type="hidden" name="blockId" value={blockId} />
{/if}

<label class="label">
  <span>{t('common.name')}</span>
  <input class="input" name="name" type="text" placeholder={t('common.enterName')} bind:value={name} />
</label>

{#if fileUploadProps != null}
  <FileUpload accept="image/*" label={t('blocks.topoImage')} {...fileUploadProps} />
{/if}
