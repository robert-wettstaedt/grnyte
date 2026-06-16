<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import BlockRow from './BlockRow.svelte'

  const { Story } = defineMeta({
    title: 'Components/EntityRow/BlockRow',
    component: BlockRow,
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
  })
</script>

{#snippet template(args: ComponentProps<typeof BlockRow>)}
  <div style="width: 360px;">
    <BlockRow {...args} />
  </div>
{/snippet}

<Story
  name="Default"
  args={{ name: 'The Arch', crumbs: 'Roadside', subline: '12 routes · 6 m', badge: '12' }}
  {template}
/>

<Story name="No badge" args={{ name: 'The Arch', crumbs: 'Roadside', subline: '12 routes · 6 m' }} {template} />
