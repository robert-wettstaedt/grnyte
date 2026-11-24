import { at } from '$lib/forms/page.fixture.svelte'
import { expectGoBack } from '$lib/forms/screen.fixture'
import { it, vi } from 'vitest'
import ForgotPassword from './+page.svelte'
import { forgotPassword } from './forgot-password.remote'

vi.mock('$app/state', async () => ({ page: (await import('$lib/forms/page.fixture.svelte')).at }))
vi.mock('$lib/auth/password/password.remote', () => ({ setNewPassword: vi.fn() }))
vi.mock('./forgot-password.remote', async () => ({
  confirmResetCode: vi.fn(),
  forgotPassword: (await import('$lib/forms/page.fixture.svelte')).fakeRemoteForm(),
}))

it('goes back from the code step to the address it was sent to', async () => {
  at.url = new URL('http://localhost/auth/forgot-password')
  const fake = forgotPassword as unknown as Parameters<typeof expectGoBack>[1]
  await expectGoBack(ForgotPassword, fake, { email: 'someone@example.test' })
})
