<script lang="ts">
  import { m } from '$lib/paraglide/messages'
  import BlockEditor from '../BlockEditor.svelte'
</script>

<BlockEditor initialStep="pin" title={m.blocks_move()} />
