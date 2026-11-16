<script lang="ts">
  import { resolve } from '$app/paths'
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { m } from '$lib/paraglide/messages'
</script>

<!-- prettier-ignore: the period must touch the link, or a space shows before it. -->
<!-- prettier-ignore -->
<p class="text-surface-500 mt-4.5 text-center text-[11.5px] leading-normal">
  {m.auth_termsAgree({ name: PUBLIC_APPLICATION_NAME })}
  <a href={resolve('/legal/terms')} class="text-surface-600-400 underline">{m.legal_terms_title()}</a>
  &amp;
  <a href={resolve('/legal/privacy')} class="text-surface-600-400 underline">{m.legal_privacy_title()}</a>.
</p>
