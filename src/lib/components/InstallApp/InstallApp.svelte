<script lang="ts">
  import Icon from '$lib/components/Icon/Icon.svelte'
  import type { IconName } from '$lib/components/Icon/icons'
  import { m } from '$lib/paraglide/messages'
  import { dismissBanner, installPromoMode, promptInstall, type InstallMode } from '$lib/state/install.svelte'

  /**
   * The one card that promotes installing the app, on every surface that promotes it: the feed
   * banner, the settings card and the invite-accept screen.
   *
   * It renders nothing at all when there is nothing to offer (desktop, already installed, or a
   * touch browser that neither exposes a prompt nor needs the install for push), so a caller can
   * place it unconditionally.
   */
  interface Props {
    class?: string
    /** The surfaces a reader can close. Passing it also opts the card into the nag policy, because
     *  a card nobody can dismiss has nothing to snooze. */
    dismissible?: boolean
    /**
     * Pitch offline rather than convenience, for the surfaces where that is the stronger reason:
     * it is what a climber loses in a forest, and on iOS an installed app is also the difference
     * between storage that survives a week and storage that survives indefinitely.
     *
     * A prop rather than a rewrite of `install_body`, because that copy is shared with PushSetup,
     * where the card sits inside a notifications flow and an offline pitch answers a question
     * nobody asked.
     */
    offline?: boolean
    /** A surface somebody navigated to on purpose. Falls back to naming the browser's own install
     *  entry rather than going quiet when there is no live prompt to fire. */
    permanent?: boolean
  }

  const { class: className = '', dismissible = false, offline = false, permanent = false }: Props = $props()

  // Every input is a browser fact, so on a server-rendered page this would resolve to 'none' and
  // then change under hydration. Not a problem at any of today's call sites - the (app) group is
  // `ssr = false`, and the invite screen only mounts this after a click - but a future caller on
  // an SSR'd page needs to gate this behind a mounted flag.
  const mode: InstallMode = $derived(installPromoMode({ dismissible, permanent }))

  // Two steps either way, and only the wording of the first one differs: a share sheet where the
  // install is a share action, the overflow menu where it is a menu entry.
  const steps: { icon: IconName; text: string }[] = $derived(
    mode === 'menu'
      ? [
          { icon: 'more', text: m.install_menuOpen() },
          { icon: 'plus', text: m.install_menuAdd() },
        ]
      : [
          { icon: 'share', text: m.install_manualShare() },
          { icon: 'plus', text: m.install_manualAdd() },
        ],
  )
</script>

{#if mode !== 'none'}
  <div class="border-surface-200-800 bg-surface-100-900 flex gap-3 rounded-xl border p-4 {className}">
    <div class="bg-primary-500/15 text-primary-500 flex size-10 flex-none items-center justify-center rounded-xl">
      <Icon name={offline ? 'no-signal' : 'smartphone'} size={20} />
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-surface-950-50 font-semibold">
        {mode === 'manual' ? m.install_manualTitle() : m.install_title()}
      </p>
      <p class="text-surface-600-400 mt-0.5 text-sm text-pretty">
        {offline ? m.install_offlineBody() : m.install_body()}
      </p>

      {#if mode === 'prompt'}
        <!-- The click is load-bearing, not decoration: `prompt()` needs a user gesture. -->
        <button type="button" class="btn btn-sm preset-filled-primary-500 mt-3" onclick={promptInstall}>
          {m.install_cta()}
        </button>
      {:else}
        <!-- No API to call here, so instructions are the entire conversion surface. -->
        <ol class="text-surface-600-400 mt-3 space-y-1.5 text-sm">
          {#each steps as step (step.icon)}
            <li class="flex items-center gap-2">
              <Icon name={step.icon} size={16} class="flex-none" />
              {step.text}
            </li>
          {/each}
        </ol>
      {/if}
    </div>

    {#if dismissible}
      <button
        type="button"
        aria-label={m.install_dismiss()}
        class="btn-icon hover:preset-tonal flex-none"
        onclick={dismissBanner}
      >
        <Icon name="close" size={16} />
      </button>
    {/if}
  </div>
{/if}
