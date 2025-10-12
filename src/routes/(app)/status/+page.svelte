<script lang="ts">
  import { getBunnyStatus, getNextcloudStatus, getSupabaseStatus, getZeroStatus } from './page.remote'
  import Status from './Status.svelte'
</script>

<div class="card preset-filled-surface-100-900 mx-auto mt-8 max-w-lg space-y-5 p-4">
  <header class="space-y-1">
    <h2 class="h4">Service Status</h2>
  </header>

  <section class="w-full space-y-5">
    <ul>
      <li class="flex justify-between p-2">
        <span>Zero</span>
        <Status query={getZeroStatus} />
      </li>

      <li class="border-surface-800 flex justify-between border-t p-2">
        <span>Supabase</span>
        <Status query={getSupabaseStatus} />
      </li>

      <li class="border-surface-800 flex justify-between border-t p-2">
        <span>Nextcloud</span>
        <Status query={getNextcloudStatus} />
      </li>

      <li class="border-surface-800 flex justify-between border-t p-2">
        <span>Bunny</span>
        <Status query={getBunnyStatus} />
      </li>
    </ul>
  </section>
</div>
