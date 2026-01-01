<script lang="ts">
  import GradeFormField from '$lib/components/GradeFormField'
  import { pageState } from '$lib/components/Layout'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import type { Row } from '$lib/db/zero'
  import RouteNameFormField from './components/RouteNameFormField'

  interface Props {
    blockId: Row<'blocks'>['id']
    description: Row<'routes'>['description'] | null | undefined
    gradeFk: Row<'routes'>['gradeFk'] | null | undefined
    name: Row<'routes'>['name'] | null | undefined
    rating: Row<'routes'>['rating'] | null | undefined
    routeId?: Row<'routes'>['id'] | null | undefined
    routeTags: string[] | null | undefined
  }

  let {
    blockId,
    description = $bindable(),
    gradeFk = $bindable(),
    name = $bindable(),
    rating = $bindable(),
    routeId,
    routeTags = $bindable(),
  }: Props = $props()
</script>

<input type="hidden" name="blockId" value={blockId} />
<input type="hidden" name="routeId" value={routeId} />

<RouteNameFormField bind:value={name} />

<GradeFormField bind:value={gradeFk} withModal />

<RatingFormField bind:value={rating} />

<label class="label mt-4">
  <span>Description</span>
  <textarea hidden name="description" value={description}></textarea>

  <MarkdownEditor bind:value={description} />
</label>

<label class="label mt-4">
  <span>Tags</span>
  <select class="select max-h-[300px] overflow-auto" multiple name="tags" bind:value={routeTags}>
    {#each pageState.tags as tag}
      <option class="rounded p-1" value={tag.id}>{tag.id}</option>
    {/each}
  </select>
</label>
