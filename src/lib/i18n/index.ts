import type { i18n as I18nInstance } from 'i18next'
import i18next from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { getContext, setContext } from 'svelte'
import { createI18nStore } from 'svelte-i18next'
import de from './locales/de.json'
import en from './locales/en.json'
import { get, type Readable } from 'svelte/store'

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

export const initI18n = () => setContext('i18n', createI18nStore(i18next))

export const getI18n = () => {
  const i18n = getContext('i18n') as Readable<I18nInstance>
  return get(i18n)
}

export const getLanguage = () => {
  const { language } = getI18n()
  return languages.find((lang) => lang === language) ?? defaultLanguage
}
