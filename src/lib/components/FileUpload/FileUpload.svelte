<script lang="ts" module>
  export interface FileUploadProps {
    accept?: string
    error?: string | null | undefined
    folderName: string | null | undefined
    label?: string
    loading: boolean
    progress: number | null | undefined
  }
</script>

<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte'

  let {
    accept = 'image/*,video/*',
    error,
    folderName,
    label = 'Upload file',
    loading,
    progress: fileProgress,
  }: FileUploadProps = $props()
</script>

{#if error}
  <aside class="card preset-tonal-warning my-8 p-2 md:p-4 whitespace-pre-line">
    <p>{error}</p>
  </aside>
{/if}

<label class="label mt-4">
  <span class="label">{label}</span>
  <input class="input" name="files" type="file" {accept} />

  {#if loading}
    <Progress max={100} meterBg="bg-primary-500" value={fileProgress} />
  {/if}

  <input type="hidden" name="folderName" value={folderName} />
</label>
