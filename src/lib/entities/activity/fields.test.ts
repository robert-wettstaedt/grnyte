import { hasMessage } from '$lib/i18n/message'
import { describe, expect, it } from 'vitest'
import { activityFields } from './fields'

describe('activityFields', () => {
  it('has a message for every field label', () => {
    const missing = Object.values(activityFields)
      .map((field) => field.labelKey)
      .filter((key) => !hasMessage(key))

    expect(missing).toEqual([])
  })
})
