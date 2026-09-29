<script lang="ts">
  import type { RemoteFormField } from '@sveltejs/kit'

  const { field }: { field: RemoteFormField<string> } = $props()
</script>

<!-- Off-screen, not type=hidden: bots skip hidden inputs. The data-* opt password managers out. -->
<div class="honeypot" aria-hidden="true">
  <input
    {...field.as('text')}
    autocomplete="off"
    tabindex="-1"
    data-1p-ignore
    data-lpignore="true"
    data-bwignore
    data-form-type="other"
  />
</div>

<style>
  .honeypot {
    position: absolute;
    left: -10000px;
    width: 1px;
    height: 1px;
    overflow: hidden;
  }
</style>
