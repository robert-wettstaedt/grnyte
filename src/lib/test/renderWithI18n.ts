import { render } from '@testing-library/svelte'
import TestI18nWrapper from './TestI18nWrapper.svelte'

export function renderWithI18n(Component: any, options?: { props?: Record<string, any>; lang?: string }) {
  return render(TestI18nWrapper, {
    props: { Component, props: options?.props ?? {}, lang: options?.lang ?? 'en' },
  })
}
