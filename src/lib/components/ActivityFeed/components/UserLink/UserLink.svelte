<script lang="ts">
  import type { Row } from '$lib/db/zero'

  interface Props {
    user: Row<'users'> | null | undefined
  }

  const { user }: Props = $props()
</script>

{#if user != null}
  <a class="anchor" href={`/users/${user.username}`}>{user.username}</a>
{/if}
