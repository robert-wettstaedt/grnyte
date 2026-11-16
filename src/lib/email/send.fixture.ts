/** `send.server` for a test that records what grnyte mailed instead of sending it; every mail goes out. */
export function recordingSend<Mail>(record: (mail: Mail) => void) {
  const sendEmail = async (mail: Mail) => {
    record(mail)
    return true
  }
  return { sendEmail, sendEmailOutcome: async (mail: Mail) => ((await sendEmail(mail)) ? 'sent' : 'failed') }
}
