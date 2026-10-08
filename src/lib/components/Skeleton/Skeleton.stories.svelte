<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import SkeletonChart from './SkeletonChart.svelte'
  import SkeletonImage from './SkeletonImage.svelte'
  import SkeletonRows from './SkeletonRows.svelte'
  import SkeletonStrip from './SkeletonStrip.svelte'

  const { Story } = defineMeta({
    component: SkeletonRows,
    parameters: { layout: 'padded' },
    tags: ['autodocs'],
    title: 'Components/Skeleton',
  })
</script>

<!-- Each holds invisible for 250 ms after mount, then pulses; reduced motion stills the pulse. -->
<Story name="Rows" />

<Story name="Rows, avatars" args={{ lead: 'avatar' }} />

<Story name="Rows, thumbnails" args={{ lead: 'thumb' }} />

<Story name="Image">
  {#snippet template()}
    <SkeletonImage class="max-h-88 w-full" ratio={4 / 3} />
  {/snippet}
</Story>

<Story name="Strip">
  {#snippet template()}
    <SkeletonStrip class="h-60" />
  {/snippet}
</Story>

<Story name="Chart">
  {#snippet template()}
    <SkeletonChart />
  {/snippet}
</Story>
