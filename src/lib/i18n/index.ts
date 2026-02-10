import { getSubscriptionId } from '$lib/components/PushNotificationSubscriber'
import type { i18n as I18nInstance } from 'i18next'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { getContext, setContext } from 'svelte'
import { createI18nStore } from 'svelte-i18next'
import { get, type Readable } from 'svelte/store'
import { updateLanguage } from './language.remote'
import de from './locales/de.json'
import en from './locales/en.json'

type Language = 'en' | 'de'
export const languages: Language[] = ['en', 'de']
export const defaultLanguage: Language = 'en'

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
  const i18n = getContext('i18n') as Readable<I18nInstance>
  return get(i18n)
}

export const getLanguage = () => {
  const { languages: userLanguages } = getI18n()
  return userLanguages.find((lang) => languages.includes(lang as Language)) ?? defaultLanguage
}
