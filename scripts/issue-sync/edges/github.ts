import { execFileSync } from 'node:child_process'
import type { Fields, IssueProgress, StatusOption } from '../core/plan'
import { token, type TokenKind } from './keychain'

export const REPO = 'robert-wettstaedt/grnyte'
/** The private roadmap project (`users/robert-wettstaedt/projects/2`). */
export const PROJECT_ID = 'PVT_kwHOAC5RuM4BB6l2'

export const FIELD_NAMES: Record<keyof Fields, string> = { Open: 'Open tasks', Worktree: 'Worktree' }

export interface Comment {
  author: string
  body: string
  id: number
}

export interface IssueOnProject {
  body: string
  /** The issue's own node id, to add it to the project. */
  contentId: string
  /** Current values of the sync's fields; absent when unset. */
  fields: Partial<Fields>
  /** The project item, or undefined when the issue is not on the roadmap project. */
  itemId?: string
  number: number
}

export function createComment(issue: number, body: string): void {
  gh('issues', ['--method', 'POST', `repos/${REPO}/issues/${issue}/comments`], { body })
}

export function graphql<T>(query: string, variables: Record<string, unknown>, kind: TokenKind = 'project'): T {
  const result = gh(kind, ['graphql'], { query, variables }) as { data: T; errors?: { message: string }[] }
  if (result.errors?.length) throw new Error(result.errors.map((error) => error.message).join('; '))
  return result.data
}

export function listComments(issue: number): Comment[] {
  const pages = gh('issues', ['--paginate', '--slurp', `repos/${REPO}/issues/${issue}/comments?per_page=100`]) as {
    body: string
    id: number
    user: { login: string }
  }[][]
  return pages.flat().map((comment) => ({ author: comment.user.login, body: comment.body, id: comment.id }))
}

/** The login the issues token writes as, so only its own comment is ever edited. */
export function self(): string {
  return (gh('issues', ['user']) as { login: string }).login
}

export function updateComment(id: number, body: string): void {
  gh('issues', ['--method', 'PATCH', `repos/${REPO}/issues/comments/${id}`], { body })
}

function gh(kind: TokenKind, args: string[], input?: unknown): unknown {
  const GH_TOKEN = token(kind)
  try {
    const out = execFileSync('gh', ['api', ...args, ...(input === undefined ? [] : ['--input', '-'])], {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN },
      input: input === undefined ? undefined : JSON.stringify(input),
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return out.trim() === '' ? null : JSON.parse(out)
  } catch (error) {
    // Node's own message names only the command; gh says why on stderr.
    const why = (error as { stderr?: string }).stderr?.trim().split('\n')[0]
    throw why ? new Error(why, { cause: error }) : error
  }
}

const ISSUE_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      ... on Issue {
        id
        number
        body
        projectItems(first: 20) {
          nodes {
            id
            project { id }
            fieldValues(first: 30) {
              nodes {
                ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { name } } }
                ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { name } } }
              }
            }
          }
        }
      }
    }
  }
}`

export interface ProjectField {
  dataType: string
  id: string
  name: string
}

type FieldValue = { field?: { name: string }; number?: number; text?: string }

export function addItem(contentId: string): void {
  graphql(
    `
      mutation ($input: AddProjectV2ItemByIdInput!) {
        addProjectV2ItemById(input: $input) {
          clientMutationId
        }
      }
    `,
    { input: { contentId, projectId: PROJECT_ID } },
  )
}

/** An issue with its roadmap item and field values; undefined for a pull request, and it throws for a number that does not exist. */
export function issueOnProject(number: number): IssueOnProject | undefined {
  const [owner, name] = REPO.split('/')
  const data = graphql<{
    repository: {
      issueOrPullRequest: null | {
        body?: string
        id?: string
        number?: number
        projectItems?: { nodes: { fieldValues: { nodes: FieldValue[] }; id: string; project: { id: string } }[] }
      }
    }
  }>(ISSUE_QUERY, { name, number, owner })
  const issue = data.repository.issueOrPullRequest
  if (issue?.id == null || issue.number == null) return undefined

  const item = issue.projectItems?.nodes.find((node) => node.project.id === PROJECT_ID)
  const value = (field: string) => item?.fieldValues.nodes.find((node) => node.field?.name === field)
  const fields: Partial<Fields> = {}
  const open = value(FIELD_NAMES.Open)?.number
  const worktree = value(FIELD_NAMES.Worktree)?.text
  if (open != null) fields.Open = open
  if (worktree != null) fields.Worktree = worktree
  return { body: issue.body ?? '', contentId: issue.id, fields, itemId: item?.id, number: issue.number }
}

/** An issue's state and status; a preview API, so it is read apart from the project query. Throws for a pull request. */
export function issueProgress(number: number): IssueProgress & { contentId: string } {
  const [owner, name] = REPO.split('/')
  const { repository } = graphql<{
    repository: {
      issue: null | { id: string; state: string; status: null | { name: string } }
      planningStatuses: null | {
        nodes: { category: null | { state: StatusOption['state'] }; id: string; name: string }[]
      }
    }
  }>(
    `
      query ($owner: String!, $name: String!, $number: Int!) {
        repository(owner: $owner, name: $name) {
          planningStatuses(first: 50) {
            nodes {
              id
              name
              category {
                state
              }
            }
          }
          issue(number: $number) {
            id
            state
            status {
              name
            }
          }
        }
      }
    `,
    { name, number, owner },
    'issues',
  )
  if (repository.issue == null) throw new Error(`no issue ${number}`)
  return {
    contentId: repository.issue.id,
    isOpen: repository.issue.state === 'OPEN',
    options: repository.planningStatuses?.nodes.map(({ category, id, name }) => ({ id, name, state: category?.state })),
    status: repository.issue.status?.name,
  }
}

export function projectFields(): ProjectField[] {
  const data = graphql<{ node: { fields: { nodes: ProjectField[] } } }>(
    `
      query ($id: ID!) {
        node(id: $id) {
          ... on ProjectV2 {
            fields(first: 50) {
              nodes {
                ... on ProjectV2FieldCommon {
                  id
                  name
                  dataType
                }
              }
            }
          }
        }
      }
    `,
    { id: PROJECT_ID },
  )
  return data.node.fields.nodes.filter((field) => field.id != null)
}

export function setField(itemId: string, field: ProjectField, value: number | string): void {
  const typed = typeof value === 'number' ? { number: value } : { text: value }
  graphql(
    `
      mutation ($input: UpdateProjectV2ItemFieldValueInput!) {
        updateProjectV2ItemFieldValue(input: $input) {
          projectV2Item {
            id
          }
        }
      }
    `,
    { input: { fieldId: field.id, itemId, projectId: PROJECT_ID, value: typed } },
  )
}

export function setStatus(issueId: string, statusId: string): void {
  graphql(
    `
      mutation ($input: SetIssueStatusInput!) {
        setIssueStatus(input: $input) {
          clientMutationId
        }
      }
    `,
    { input: { issueId, statusId } },
    'issues',
  )
}
