import { invalid } from '@sveltejs/kit'
import { PROOF_OF_WORK_FIELD, type BotFields } from './botCheck'
import { spendProofOfWork } from './proofOfWork.server'
import { formError } from './schemas'

/**
 * Run first in an anonymous handler, before anything that mails or writes. `'bot'` means answer with
 * the handler's own success, so a bot never learns it was caught; a missing or spent solve refuses.
 */
export async function screenSubmit(fields: BotFields): Promise<'bot' | 'person'> {
  if (fields.hpcheck != null && fields.hpcheck !== '') return 'bot'
  if (!(await spendProofOfWork(fields[PROOF_OF_WORK_FIELD]))) {
    invalid(formError('auth_verificationFailed'))
  }
  return 'person'
}
