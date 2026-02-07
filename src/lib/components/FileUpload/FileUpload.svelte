<script lang="ts" module>
  import type { EnhanceState } from '$lib/forms/enhance.svelte'

  export interface FileUploadProps {
    accept?: string
    folderName?: string | null | undefined
    label?: string
    state: EnhanceState | undefined
  }
</script>

<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte'
  import { getI18n } from '$lib/i18n'

  let { accept = 'image/*,video/*', folderName, label, state }: FileUploadProps = $props()
  const { t } = getI18n()
</script>

<label class="label mt-4">
  <span class="label">{label ?? t('fileUpload.uploadFile')}</span>
  <input class="input" name="files" type="file" {accept} />

  {#if state?.loading}
    <Progress max={100} value={state.progress}>
      <Progress.Track>
        <Progress.Range class="bg-primary-500" />
      </Progress.Track>
    </Progress>
  {/if}

  <input type="hidden" name="folderName" value={folderName} />
</label>
