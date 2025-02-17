<script lang="ts">
  import MarkdownEditor from '$lib/components/MarkdownEditor'
  import RatingFormField from '$lib/components/RatingFormField'
  import type { Route, Tag } from '$lib/db/schema'
  import GradeFormField from './components/GradeFormField'
  import RouteNameFormField from './components/RouteNameFormField'

  interface Props {
    blockId: number
    description: Route['description']
    gradeFk: Route['gradeFk']
    name: Route['name']
    rating: NonNullable<Route['rating']> | undefined
    routeTags: string[]
    tags: Tag[]
  }

  let {
    description = $bindable(),
    gradeFk = $bindable(),
    name = $bindable(),
    rating = $bindable(),
    routeTags,
    tags,
  }: Props = $props()
</script>

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
    {#each tags as tag}
      <option value={tag.id}>{tag.id}</option>
    {/each}
  </select>
</label>
