<script
  lang="ts"
  generics="TTable extends keyof Schema['tables'] & string,
  TInput extends ReadonlyJSONValue | undefined,
  TOutput extends ReadonlyJSONValue | undefined,
  TReturn = PullRow<TTable, Schema>,
  TContext = DefaultContext"
>
  import type { Schema } from '$lib/db/zero/zero-schema'
  import type { DefaultContext, PullRow, Query, QueryRequest } from '@rocicorp/zero'
  import { asQueryInternals } from '@rocicorp/zero/bindings'
  import type { ReadonlyJSONValue } from 'drizzle-zero'
  import type { ZeroQueryWrapperProps } from '.'
  import ZeroQueryWrapper from './ZeroQueryWrapper.svelte'

  const props: ZeroQueryWrapperProps<TTable, TInput, TOutput, TReturn, TContext> = $props()

  const hash = $derived.by(() => {
    let queryDef: Query<TTable, Schema, TReturn> | undefined

    if (Object.hasOwn(props.query, 'query')) {
      const asQueryRequest = props.query as QueryRequest<TTable, TInput, TOutput, Schema, TReturn, any>
      queryDef = asQueryRequest.query.fn({ args: asQueryRequest.args, ctx: null })
    } else if (Object.hasOwn(props.query, 'start')) {
      queryDef = props.query as Query<TTable, Schema, TReturn>
    }

    if (queryDef == null) {
      return null
    }

    return asQueryInternals(queryDef).hash()
  })
</script>

{#if hash == null}
  <ZeroQueryWrapper {...props} />
{:else}
  {#key hash}
    <ZeroQueryWrapper {...props} />
  {/key}
{/if}
