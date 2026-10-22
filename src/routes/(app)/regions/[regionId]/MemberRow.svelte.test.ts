import { render, screen } from '@testing-library/svelte'
import { expect, it, vi } from 'vitest'
import MemberRow from './MemberRow.svelte'

vi.stubGlobal('matchMedia', () => ({ addEventListener() {}, matches: false, removeEventListener() {} }))

const row = (owner: boolean) =>
  render(MemberRow, {
    canLeave: true,
    canManage: false,
    makeOwnerHref: undefined,
    member: { id: 1, invitedBy: undefined, role: 'region_admin', userId: 7, username: 'ada' },
    onLeave: () => {},
    onRemove: () => {},
    onRole: () => {},
    owner,
    regionName: 'Harz',
    role: 'region_admin',
    self: false,
  })

it('labels the owner Owner rather than Admin', () => {
  row(true)
  expect(screen.getByText('Owner')).toBeTruthy()
})

it('labels an admin who is not the owner by their role', () => {
  row(false)
  expect(screen.getByText('Admin')).toBeTruthy()
})
