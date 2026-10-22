<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import Avatar from './Avatar.svelte'

  const { Story } = defineMeta({
    args: { name: 'Mara Lindqvist', size: 34, solid: true },
    component: Avatar,
    parameters: { layout: 'centered' },
    tags: ['autodocs'],
    title: 'Components/Avatar',
  })
</script>

<Story name="Registered user" />

<Story name="Typed-in name" args={{ name: 'Fritz Wiessner', solid: false }} />

<Story name="Loading" args={{ loading: true }} />

<!-- A deleted account: a neutral face, so it never reads as a person. -->
<Story name="Deleted account" args={{ deleted: true, name: 'Deleted user' }} />
