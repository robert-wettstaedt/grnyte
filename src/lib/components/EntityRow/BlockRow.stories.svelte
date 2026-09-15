<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import BlockRow from './BlockRow.svelte'

  const { Story } = defineMeta({
    component: BlockRow,
    parameters: {
      layout: 'centered',
      width: 360,
    },
    tags: ['autodocs'],
    title: 'Components/EntityRow/BlockRow',
  })
</script>

<Story name="Default" args={{ crumbs: 'Roadside', name: 'The Arch' }} />

<Story
  name="With description"
  args={{
    crumbs: 'Roadside',
    description: 'Flat landing, out of the sun by three.',
    name: 'The Arch',
  }}
/>
