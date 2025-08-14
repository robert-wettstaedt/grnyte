<script lang="ts">
  import GradeFormField from '$lib/components/GradeFormField'
  import { pageState } from '$lib/components/Layout'
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import type { Row } from '$lib/db/zero'
  import RouteNameFormField from './components/RouteNameFormField'

  interface Props {
    blockId: Row<'blocks'>['id']
    description: Row<'routes'>['description']
    gradeFk: Row<'routes'>['gradeFk']
    name: Row<'routes'>['name']
    rating: Row<'routes'>['rating']
    routeTags: string[]
  }

  let {
    blockId,
    description = $bindable(),
    gradeFk = $bindable(),
    name = $bindable(),
    rating = $bindable(),
    routeTags,
  }: Props = $props()
</script>

<input type="hidden" name="blockId" value={blockId} />

<RouteNameFormField bind:value={name} />

<GradeFormField bind:value={gradeFk} />

<RatingFormField bind:value={rating} />

<label class="label mt-4">
  <span>Description</span>
  <textarea hidden name="description" value={description}></textarea>

  <MarkdownEditor bind:value={description} />
</label>

<label class="label mt-4">
  <span>Tags</span>
  <select class="select max-h-[300px] overflow-auto" multiple name="tags" value={routeTags}>
    {#each pageState.tags as tag}
      <option value={tag.id}>{tag.id}</option>
    {/each}
  </select>
</label>
