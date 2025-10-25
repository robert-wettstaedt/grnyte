<script lang="ts" generics="TTable extends keyof Schema['tables'] & string, TReturn">
  import type { Schema } from '$lib/db/zero/zero-schema'
  import type { ZeroQueryWrapperProps } from '.'
  import ZeroQueryWrapper from './ZeroQueryWrapper.svelte'

  const props: ZeroQueryWrapperProps<TTable, TReturn> = $props()
</script>

{#key props.query.hash()}
  <ZeroQueryWrapper {...props} />
{/key}
