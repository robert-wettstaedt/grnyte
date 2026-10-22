import { expect, it } from 'vitest'
import { toMediaFile } from './mapper'

const row = {
  bunnyStreamFk: null,
  createdAt: 1,
  height: null,
  id: 'f1',
  path: '/a.jpg',
  regionFk: 1,
  visibility: null,
  width: null,
}

it('credits a photo whose uploader deleted their account, with no profile to link', () => {
  expect(toMediaFile({ ...row, createdBy: null }).uploader).toEqual({ id: null, name: 'Deleted user' })
})

it('credits a live uploader by name', () => {
  expect(toMediaFile({ ...row, author: { id: 4, username: 'ada' }, createdBy: 4 }).uploader).toEqual({
    id: 4,
    name: 'ada',
  })
})
