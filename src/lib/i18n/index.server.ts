import i18next from 'i18next'
import de from './locales/de.json'
import en from './locales/en.json'

i18next.init({
  resources: { en, de },
  interpolation: {
    escapeValue: false,
  },
})

export const i18n = i18next
