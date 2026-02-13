<script lang="ts">
  import { PUBLIC_APPLICATION_NAME } from '$env/static/public'
  import { getI18n } from '$lib/i18n'

  // @ts-ignore
  const repoUrl = __APP_REPO__

  const { t } = getI18n()
</script>

<footer class="bg-surface-100-900 border-surface-500/20 mt-auto border-t">
  <div class="container mx-auto px-4 py-6">
    <div class="flex flex-col justify-between gap-6 md:flex-row">
      <!-- App Info -->
      <div class="flex flex-col">
        <h3 class="mb-2 text-lg font-bold">{PUBLIC_APPLICATION_NAME}</h3>
        <p class="text-sm opacity-75">
          {t('footer.tagline')}
        </p>

        <a href="/status" class="anchor hover:text-primary-500 mt-4 md:mt-auto">{t('settings.serviceStatus')}</a>
      </div>

      <!-- Legal Links -->
      <div>
        <h4 class="mb-2 font-semibold">{t('common.legal')}</h4>
        <ul class="space-y-1 text-sm">
          <li>
            <a href="/legal/privacy" class="anchor hover:text-primary-500">{t('legal.privacyPolicy')}</a>
          </li>
          <li>
            <a href="/legal/terms" class="anchor hover:text-primary-500">{t('legal.termsOfService')}</a>
          </li>
          <li>
            <a href="/legal/cookies" class="anchor hover:text-primary-500">{t('legal.cookiePolicy')}</a>
          </li>
          <li>
            <a href="/legal/disclaimer" class="anchor hover:text-primary-500">{t('legal.disclaimer')}</a>
          </li>
        </ul>
      </div>
    </div>

    <!-- Copyright and Links -->
    <div class="border-surface-500/20 mt-6 border-t pt-6">
      <div class="flex flex-col items-center justify-between text-sm opacity-75 md:flex-row">
        <div>
          <p>© {new Date().getFullYear()} {PUBLIC_APPLICATION_NAME}. {t('footer.noCommercialIntent')}</p>
        </div>

        <div class="mt-2 md:mt-0">
          <span class="inline-flex items-center gap-2">
            <a href={repoUrl} target="_blank" class="anchor hover:text-primary-500">
              <i class="fa-brands fa-github"></i>
              {t('common.source')}
            </a>
            <span class="opacity-50">•</span>
            <span>{t('common.madeWithLove')}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</footer>
