<script lang="ts">
  import type { Block } from '$lib/db/schema'

  interface Props {
    name: Block['name'] | undefined | null
  }

  let { name = '' }: Props = $props()
</script>

<label class="label">
  <span>Name</span>
  <input class="input" name="name" type="text" placeholder="Enter name..." value={name} />
</label>
