<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf'
  import ProviderBlock from './ProviderBlock.svelte'

  // Theme and locale come from the toolbar; pressing a provider leaves the page.
  const { Story } = defineMeta({
    args: { lastUsed: null, next: null, providers: ['apple', 'google'], screen: 'signin' },
    argTypes: {
      lastUsed: { control: 'select', options: [null, 'apple', 'google', 'email'] },
      screen: { control: 'radio', options: ['signin', 'signup'] },
    },
    component: ProviderBlock,
    title: 'Auth/ProviderBlock',
  })
</script>

<Story name="Choice" />

<Story name="Last used Google" args={{ lastUsed: 'google' }} />

<!-- Create account never badges email. -->
<Story name="Create account, email last" args={{ lastUsed: 'email', screen: 'signup' }} />

<Story name="Google only" args={{ providers: ['google'] }} />

<!-- 375 px at 200 % zoom: half the width, so a badged label wraps and must keep clear of the pill. -->
<Story name="Long label at 200 % zoom" args={{ lastUsed: 'apple' }}>
  {#snippet template(args)}
    <div class="w-[187px]"><ProviderBlock {...args} /></div>
  {/snippet}
</Story>
