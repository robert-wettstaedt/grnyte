<script lang="ts">
  import AreaStats from '$lib/components/AreaStats'
  import MarkdownRenderer from '$lib/components/MarkdownRenderer'
  import { ReferencesLoader } from '$lib/components/References'
  import type { ZeroQueryResult } from '$lib/components/ZeroQueryWrapper'
  import type { PageProps } from './$types'

  interface Props {
    area: ZeroQueryResult<PageProps['data']['query']>
  }

  const { area }: Props = $props()
</script>

<dl>
  {#if area.description != null && area.description.length > 0}
    <div class="flex p-2">
      <span class="flex-auto">
        <dt>Description</dt>
        <dd>
          <MarkdownRenderer className="mt-4" markdown={area.description} />
        </dd>
      </span>
    </div>
  {/if}

  <ReferencesLoader id={area.id!} type="areas" />

  <div class="flex p-2">
    <span class="flex-auto">
      <dt>Grades</dt>

      <dd class="mt-1 flex gap-1">
        <AreaStats
          areaId={area.id!}
          spec={{
            width: 'container' as any,
          }}
        />
      </dd>
    </span>
  </div>
</dl>
