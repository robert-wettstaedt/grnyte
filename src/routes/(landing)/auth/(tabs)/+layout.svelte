<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { m } from '$lib/paraglide/messages'
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte'
  import type { Snippet } from 'svelte'
  import type { HTMLAnchorAttributes } from 'svelte/elements'

  const { children }: { children: Snippet } = $props()

  // Drives the sliding indicator; the <a> triggers do the actual navigation.
  const mode = $derived(page.url.pathname.endsWith('/signup') ? 'signup' : 'signin')

  const tab =
    'flex h-10 flex-1 items-center justify-center text-sm font-semibold text-surface-600-400 data-[state=checked]:text-primary-contrast-500'
</script>

<!-- segmented toggle: Skeleton SegmentedControl with <a> triggers (navigation, not state) -->
<SegmentedControl value={mode} class="mb-7">
  <SegmentedControl.Control class="w-full">
    <SegmentedControl.Indicator class="preset-filled-primary-500" />
    <SegmentedControl.Item value="signin">
      {#snippet element(attributes)}
        <!-- attrs are typed for the default <label>; spread onto <a> works at runtime -->
        <a {...attributes as unknown as HTMLAnchorAttributes} href={resolve('/auth/signin')} class={tab}>
          {m.auth_signIn()}
        </a>
      {/snippet}
    </SegmentedControl.Item>
    <SegmentedControl.Item value="signup">
      {#snippet element(attributes)}
        <!-- attrs are typed for the default <label>; spread onto <a> works at runtime -->
        <a {...attributes as unknown as HTMLAnchorAttributes} href={resolve('/auth/signup')} class={tab}>
          {m.auth_signUp()}
        </a>
      {/snippet}
    </SegmentedControl.Item>
  </SegmentedControl.Control>
</SegmentedControl>

{@render children()}

<p class="text-surface-500 mt-7 text-center text-[11.5px] leading-normal">
  {m.auth_termsAgree()}
  <a href={resolve('/legal/terms')} class="text-surface-600-400 underline">{m.auth_terms()}</a>
  &amp;
  <a href={resolve('/legal/privacy')} class="text-surface-600-400 underline">{m.auth_privacyPolicy()}</a>
  .
</p>
