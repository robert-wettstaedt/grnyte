<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import BlockRow from './BlockRow.svelte'

  const { Story } = defineMeta({
    component: BlockRow,
    parameters: {
      layout: 'centered',
    },
    tags: ['autodocs'],
    title: 'Components/EntityRow/BlockRow',
  })
</script>

{#snippet template(args: ComponentProps<typeof BlockRow>)}
  <div style="width: 360px;">
    <BlockRow {...args} />
  </div>
{/snippet}

<Story
  name="Default"
  args={{ badge: '12', crumbs: 'Roadside', name: 'The Arch', subline: '12 routes · 6 m' }}
  {template}
/>

<Story name="No badge" args={{ crumbs: 'Roadside', name: 'The Arch', subline: '12 routes · 6 m' }} {template} />
