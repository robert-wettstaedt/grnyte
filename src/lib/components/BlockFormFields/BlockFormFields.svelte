<script lang="ts">
  import FileUpload, { type FileUploadProps } from '$lib/components/FileUpload'
  import type { Row } from '$lib/db/zero'

  interface Props {
    areaFk: Row<'blocks'>['areaFk'] | undefined | null
    name: Row<'blocks'>['name'] | undefined | null
    fileUploadProps?: FileUploadProps
  }

  let { areaFk, name = '', fileUploadProps }: Props = $props()
</script>

{#if areaFk != null}
  <input type="hidden" name="areaId" value={areaFk} />
{/if}

<label class="label">
  <span>Name</span>
  <input class="input" name="name" type="text" placeholder="Enter name..." value={name} />
</label>

{#if fileUploadProps != null}
  <FileUpload accept="image/*" label="Topo image" {...fileUploadProps} />
{/if}
