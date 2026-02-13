import { getSubscriptionId } from '$lib/components/PushNotificationSubscriber'
import { updateLanguage } from '$lib/i18n/language.remote'
import type { i18n as I18nInstance } from 'i18next'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { getContext, setContext } from 'svelte'
import { createI18nStore } from 'svelte-i18next'
import { fromStore, type Readable } from 'svelte/store'
import de from './locales/de.json'
import en from './locales/en.json'
import { defaultLanguage, type Language, languages } from './utils'

export * from './utils'

i18next.use(LanguageDetector).init({
  fallbackLng: defaultLanguage,
  resources: { en, de },
  interpolation: {
    escapeValue: false, // not needed for svelte as it escapes by default
  },
})

export const initI18n = () => {
  const store = createI18nStore(i18next)
  setContext('i18n', store)

  store.subscribe(async ({ languages: userLanguages }) => {
    try {
      const language = userLanguages.find((lang) => languages.includes(lang as Language))
      const pushSubscriptionId = await getSubscriptionId()

      if (language != null && pushSubscriptionId != null) {
        await updateLanguage({ language, pushSubscriptionId })
      }
    } catch (error) {
      console.log(error)
    }
  })
}

export const getI18n = () => {
  const i18nStore = getContext('i18n') as Readable<I18nInstance>
  const reactive = fromStore(i18nStore)
  const language = reactive.current.languages.find((lang) => languages.includes(lang as Language))

  return {
    t: ((...args: Parameters<I18nInstance['t']>) => reactive.current.t(...args)) as I18nInstance['t'],
    changeLanguage: (...args: Parameters<I18nInstance['changeLanguage']>) => reactive.current.changeLanguage(...args),
    language: language as Language,
  }
}
