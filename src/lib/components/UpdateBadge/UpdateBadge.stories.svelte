<script module lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import Logo from '$lib/assets/logo.svg'
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import UpdateBadge from './UpdateBadge.svelte'

  const { Story } = defineMeta({
    component: UpdateBadge,
    tags: ['autodocs'],
    title: 'Components/UpdateBadge',
  })
</script>

<!-- On the logo, at both sizes it ships at: 40px in the desktop nav rail, 44px in the mobile map
     header. The badge is sized and ringed against the logo's own purple fill and the page behind
     the corner it overhangs, so a story on a bare background would be checking neither. Both sizes
     are here because a 9px glyph is the part that stops being legible first. -->
<Story name="On the logo">
  {#snippet template(args)}
    <div class="flex items-center gap-8 p-8">
      <a class="relative" href="##">
        <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="size-10" />
        <UpdateBadge {...args} updateReady={true} />
      </a>

      <a class="relative" href="##">
        <img class="h-11 w-11" src={Logo} alt={PUBLIC_APPLICATION_NAME} width={44} height={44} />
        <UpdateBadge {...args} updateReady={true} />
      </a>
    </div>
  {/snippet}
</Story>

<!-- Nothing rendered, which is the state every reader is in except in the hour after a deploy. -->
<Story name="Up to date">
  {#snippet template(args)}
    <div class="flex items-center gap-8 p-8">
      <a class="relative" href="##">
        <img src={Logo} alt={PUBLIC_APPLICATION_NAME} class="size-10" />
        <UpdateBadge {...args} updateReady={false} />
      </a>
    </div>
  {/snippet}
</Story>
