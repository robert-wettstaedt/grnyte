// Creates the sync's project fields once; the sync itself never creates fields.
import { FIELD_NAMES, graphql, PROJECT_ID, projectFields } from '../edges/github'

const wanted = [
  { dataType: 'TEXT', name: FIELD_NAMES.Worktree },
  { dataType: 'NUMBER', name: FIELD_NAMES.Open },
]

const existing = new Set(projectFields().map((field) => field.name))
const missing = wanted.filter((field) => !existing.has(field.name))
if (missing.length === 0) console.log(`nothing to do: ${wanted.map((field) => field.name).join(', ')} exist`)
for (const field of missing) {
  graphql(
    `
      mutation ($input: CreateProjectV2FieldInput!) {
        createProjectV2Field(input: $input) {
          projectV2Field {
            ... on ProjectV2FieldCommon {
              id
            }
          }
        }
      }
    `,
    { input: { ...field, projectId: PROJECT_ID } },
  )
  console.log(`created ${field.name}`)
}
