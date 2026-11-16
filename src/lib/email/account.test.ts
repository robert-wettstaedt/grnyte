/** The account mails by content: the code in the reauth subject, the action or methods named, German in German. */
import { describe, expect, it } from 'vitest'
import { accountDeleted, alreadyHasAccount, appleRemoved, ownershipHandedOver, reauthCode } from './account'
import type { EmailContent, EmailLocale } from './shell'

const methods = { hasPassword: true, providers: ['email' as const, 'google' as const] }
const render: Record<string, (locale: EmailLocale) => EmailContent> = {
  accountDeleted: (locale) => accountDeleted({ locale, methods }),
  alreadyHasAccount: (locale) => alreadyHasAccount({ forgotPasswordUrl: 'https://x.test/f', locale, methods }),
  appleRemoved: (locale) => appleRemoved({ locale, methods }),
  ownershipHandedOver: (locale) => ownershipHandedOver({ locale, methods, owner: 'Kim', region: 'Elbsandstein' }),
  reauthCode: (locale) => reauthCode({ action: 'region.delete', code: '042917', locale, methods }),
}

const lines = (mail: EmailContent) =>
  [mail.subject, mail.title, mail.meta, mail.preheader, mail.footnote, mail.action?.label, ...mail.body].filter(
    (line): line is string => line != null,
  )

describe('account mails', () => {
  it('puts the code in the reauthCode subject in both locales', () => {
    expect(render.reauthCode('en').subject).toContain('042917')
    expect(render.reauthCode('de').subject).toContain('042917')
  })

  it('names the action in the reauthCode body', () => {
    expect(render.reauthCode('en').body.join(' ')).toContain('delete a region')
    expect(render.reauthCode('de').body.join(' ')).toContain('eine Region zu löschen')
  })

  it.each(['accountDeleted', 'alreadyHasAccount'])('%s names the methods it is given', (name) => {
    expect(render[name]('en').body.join(' ')).toContain('your password or Google')
    expect(render[name]('de').body.join(' ')).toContain('dein Passwort oder Google')
  })

  it.each(Object.keys(render))('%s ends with a not-me line naming the methods', (name) => {
    expect(render[name]('en').footnote).toContain('Google')
  })

  it.each(['en', 'de'] as const)(
    'adds the Apple revocation line to the deletion mail only when told (%s)',
    (locale) => {
      const line = { de: 'von deiner Apple-ID getrennt', en: 'disconnected grnyte from your Apple ID' }[locale]
      expect(accountDeleted({ appleRevoked: true, locale, methods }).body.join(' ')).toContain(line)
      expect(accountDeleted({ locale, methods }).body.join(' ')).not.toContain(line)
    },
  )

  it('names region and new owner in the handover mail', () => {
    expect(render.ownershipHandedOver('en').body[0]).toMatch(/Elbsandstein.*Kim/)
  })

  it.each(Object.keys(render))('%s renders no English line in German', (name) => {
    const english = new Set(lines(render[name]('en')))
    expect(lines(render[name]('de')).filter((line) => english.has(line))).toEqual([])
  })
})
