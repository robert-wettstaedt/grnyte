<script lang="ts">
  import { m } from '$lib/paraglide/messages'

  interface Props {
    /** When true, only the signed-in user's favorited routes are shown. */
    value: boolean
  }

  let { value = $bindable() }: Props = $props()
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label={m.filter_favorites()}>
  <button
    type="button"
    aria-pressed={value}
    class={['btn btn-sm', value ? 'preset-filled-primary-500' : 'preset-tonal']}
    onclick={() => (value = !value)}
  >
    {m.filter_favoritesOnly()}
  </button>
</div>
