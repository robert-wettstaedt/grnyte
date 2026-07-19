<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import type { ComponentProps } from 'svelte'
  import UserRow from './UserRow.svelte'

  const { Story } = defineMeta({
    component: UserRow,
    parameters: {
      layout: 'centered',
    },
    tags: ['autodocs'],
    title: 'Components/EntityRow/UserRow',
  })
</script>

{#snippet template(args: ComponentProps<typeof UserRow>)}
  <div style="width: 360px;">
    <UserRow {...args} />
  </div>
{/snippet}

<Story name="Default" args={{ name: 'Lena Hoffmann' }} {template} />
