import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ur from './locales/ur.json'

export const LANGUAGES = {
  en: { label: 'English', dir: 'ltr' },
  ur: { label: 'اردو', dir: 'rtl' },
}

function applyDirection(lng) {
  const lang = LANGUAGES[lng] ? lng : 'en'
  document.documentElement.lang = lang
  document.documentElement.dir = LANGUAGES[lang].dir
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, ur: { translation: ur } },
    fallbackLng: 'en',
    supportedLngs: Object.keys(LANGUAGES),
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['querystring', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
  })

applyDirection(i18n.resolvedLanguage)
i18n.on('languageChanged', applyDirection)

export default i18n
