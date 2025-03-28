<script lang="ts">
  import { applyAction, enhance } from '$app/forms'
  import { convertException, TimeoutError, timeoutFunction } from '$lib/errors'
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte'
  import { onMount } from 'svelte'
  import { isSubscribed, isSupported, STORAGE_KEY, subscribe, unsubscribe } from './lib'

  interface Props {
    onChange?: () => void
  }

  const { onChange }: Props = $props()

  const supported = isSupported()
  let subscribed = $state(false)
  let errorMessage = $state('')
  let loading = $state(false)

  onMount(async () => {
    subscribed = await isSubscribed()
  })
</script>

{#if supported}
  <div class="flex flex-wrap justify-center gap-2">
    {#if subscribed}
      <form
        action="?/unsubscribe"
        method="post"
        use:enhance={async ({ formData }) => {
          errorMessage = ''
          loading = true

          try {
            await timeoutFunction(unsubscribe, 10_000)
          } catch (exception) {
            if (exception instanceof TimeoutError) {
              errorMessage =
                'Unable to unsubscribe from push notifications. Please try again or check your browser settings.'
            } else {
              errorMessage = convertException(exception)
            }
          }

          subscribed = false
          const pushSubscriptionId = localStorage.getItem(STORAGE_KEY)
          localStorage.removeItem(STORAGE_KEY)
          onChange?.()

          if (pushSubscriptionId == null) {
            loading = false
            throw new Error()
          }

          formData.set('pushSubscriptionId', pushSubscriptionId)

          return async ({ result }) => {
            loading = false

            return applyAction(result)
          }
        }}
      >
        <button class="btn preset-filled-error-500" disabled={loading} type="submit">
          {#if loading}
            <ProgressRing size="size-4" value={null} />
          {/if}

          Unsubscribe from Notifications
        </button>
      </form>

      <form action="?/test" method="post" use:enhance>
        <button class="btn preset-outlined-primary-500" type="submit"> Send Test Notification </button>
      </form>
    {:else}
      <form
        action="?/subscribe"
        method="post"
        use:enhance={async ({ formData }) => {
          errorMessage = ''
          loading = true

          try {
            const subscription = await timeoutFunction(subscribe, 10_000)
            formData.set('subscription', JSON.stringify(subscription))

            const pushSubscriptionId = localStorage.getItem(STORAGE_KEY)
            if (pushSubscriptionId) {
              formData.set('pushSubscriptionId', pushSubscriptionId)
            }
          } catch (exception) {
            if (exception instanceof TimeoutError) {
              errorMessage =
                'Unable to subscribe to push notifications. Please try again or check your browser settings.'
            } else {
              errorMessage = convertException(exception)
            }
            loading = false
            throw exception
          }

          return async ({ update, result }) => {
            loading = false
            onChange?.()

            if (result.type === 'success' && typeof result.data?.subscriptionId === 'number') {
              subscribed = true
              localStorage.setItem(STORAGE_KEY, String(result.data.subscriptionId))
            } else {
              subscribed = false
            }

            return update()
          }
        }}
      >
        <button class="btn preset-filled-primary-500" disabled={loading} type="submit">
          {#if loading}
            <ProgressRing size="size-4" value={null} />
          {/if}

          Receive Push Notifications
        </button>
      </form>
    {/if}
  </div>

  {#if errorMessage}
    <aside class="card preset-tonal-error my-4 p-4 whitespace-pre-line">
      <p>{errorMessage}</p>
    </aside>
  {/if}
{/if}
