<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import UserRow from './UserRow.svelte'

  const { Story } = defineMeta({
    component: UserRow,
    parameters: {
      layout: 'centered',
      width: 360,
    },
    tags: ['autodocs'],
    title: 'Components/EntityRow/UserRow',
  })
</script>

<Story name="Default" args={{ name: 'Lena Hoffmann' }} />
