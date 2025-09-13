<script lang="ts" generics="TSchema extends Schema, TTable extends keyof TSchema['tables'] & string, TReturn">
  import type { Schema } from '@rocicorp/zero'
  import type { ZeroQueryWrapperProps } from '.'
  import ZeroQueryWrapper from './ZeroQueryWrapper.svelte'

  const props: ZeroQueryWrapperProps<TSchema, TTable, TReturn> = $props()
</script>

{#key props.query.hash()}
  <ZeroQueryWrapper {...props} />
{/key}
