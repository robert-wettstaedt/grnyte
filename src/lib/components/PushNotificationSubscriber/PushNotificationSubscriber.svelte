<script lang="ts">
  import LoadingIndicator from '$lib/components/LoadingIndicator'
  import { convertException, TimeoutError, timeoutFunction } from '$lib/errors'
  import { getI18n } from '$lib/i18n'
  import { onMount } from 'svelte'
  import { isSubscribed, isSupported, STORAGE_KEY, subscribe, unsubscribe } from './lib'
  import {
    sendTest,
    subscribe as subscribeAction,
    unsubscribe as unsubscribeAction,
  } from './pushNotificationSubscriber.remote'

  interface Props {
    onChange?: () => void
  }

  const { onChange }: Props = $props()

  const supported = isSupported()
  let subscribed = $state(false)
  let errorMessage = $state('')
  const { t } = getI18n()

  onMount(async () => {
    subscribed = await isSubscribed()
  })

  const { language } = getI18n()
</script>

{#if supported}
  <div class="flex flex-wrap justify-center gap-2">
    {#if subscribed}
      <button
        class="btn preset-filled-error-500"
        disabled={unsubscribeAction.pending > 0}
        type="submit"
        onclick={async () => {
          errorMessage = ''

          try {
            await timeoutFunction(unsubscribe, 10_000)
          } catch (exception) {
            if (exception instanceof TimeoutError) {
              errorMessage = t('notifications.unableToUnsubscribeDetailed')
            } else {
              errorMessage = convertException(exception)
            }
          }

          subscribed = false
          const pushSubscriptionId = Number(localStorage.getItem(STORAGE_KEY))
          localStorage.removeItem(STORAGE_KEY)
          onChange?.()

          if (Number.isNaN(pushSubscriptionId)) {
            throw new Error()
          }

          await unsubscribeAction(pushSubscriptionId)
        }}
      >
        {#if unsubscribeAction.pending > 0}
          <LoadingIndicator />
        {/if}
        {t('notifications.unsubscribeButton')}
      </button>

      <button class="btn preset-outlined-primary-500" type="submit" onclick={() => sendTest()}>
        {#if sendTest.pending > 0}
          <LoadingIndicator />
        {/if}
        {t('notifications.sendTest')}
      </button>
    {:else}
      <button
        class="btn preset-filled-primary-500"
        disabled={subscribeAction.pending > 0}
        type="submit"
        onclick={async () => {
          errorMessage = ''

          try {
            const subscription = await timeoutFunction(subscribe, 10_000)
            const pushSubscriptionId = Number(localStorage.getItem(STORAGE_KEY))

            const result = await subscribeAction({
              subscription: { ...subscription, lang: language },
              pushSubscriptionId: Number.isNaN(pushSubscriptionId) ? undefined : pushSubscriptionId,
            })

            subscribed = true
            localStorage.setItem(STORAGE_KEY, String(result))
          } catch (exception) {
            if (exception instanceof TimeoutError) {
              errorMessage = t('notifications.unableToSubscribeDetailed')
            } else {
              errorMessage = convertException(exception)
            }

            subscribed = false

            throw exception
          } finally {
            onChange?.()
          }
        }}
      >
        {#if subscribeAction.pending > 0}
          <LoadingIndicator />
        {/if}
        {t('notifications.receivePush')}
      </button>
    {/if}
  </div>

  {#if errorMessage}
    <aside class="card preset-tonal-error my-4 p-4 whitespace-pre-line">
      <p>{errorMessage}</p>
    </aside>
  {/if}
{/if}
