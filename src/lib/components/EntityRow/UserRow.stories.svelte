<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import UserRow from './UserRow.svelte'

  const { Story } = defineMeta({
    title: 'Components/EntityRow/UserRow',
    component: UserRow,
    tags: ['autodocs'],
    parameters: {
      layout: 'centered',
    },
  })
</script>

{#snippet template(args: ComponentProps<typeof UserRow>)}
  <div style="width: 360px;">
    <UserRow {...args} />
  </div>
{/snippet}

<Story
  name="Default"
  args={{ name: 'Lena Hoffmann', subline: '128 ascents · 5 areas', initials: 'LH', hue: 320 }}
  {template}
/>
