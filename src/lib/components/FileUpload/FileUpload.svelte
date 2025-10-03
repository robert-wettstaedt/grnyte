<script lang="ts" module>
  import type { EnhanceState } from '$lib/forms/enhance.svelte'

  export interface FileUploadProps {
    accept?: string
    label?: string
    state: EnhanceState | undefined
  }
</script>

<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte'

  let { accept = 'image/*,video/*', label = 'Upload file', state }: FileUploadProps = $props()
</script>

<label class="label mt-4">
  <span class="label">{label}</span>
  <input class="input" name="files" type="file" {accept} form="file-upload-form" />

  {#if state?.loading}
    <Progress max={100} meterBg="bg-primary-500" value={state?.progress} />
  {/if}

  {#each Object.entries(state?.additionalFields ?? {}) as [name, value]}
    <input type="hidden" {name} {value} />
  {/each}
</label>
