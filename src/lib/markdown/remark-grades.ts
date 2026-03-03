import type { Row } from '$lib/db/zero'
import { getGradeColor } from '$lib/grades'
import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace, type FindAndReplaceList, type ReplaceFunction } from 'mdast-util-find-and-replace'
import { type Plugin } from 'unified'

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const createGradeTokenRegex = (token: string): RegExp => {
  // Capture a safe prefix so we don't need lookbehind (better browser support).
  // Also prevent matching inside larger alphanumeric strings.
  const escaped = escapeRegExp(token)
  return new RegExp(`(^|[^0-9A-Za-z])(${escaped})(?![0-9A-Za-z+-])`, 'gi')
}

interface RemarkGradesOptions {
  grades?: Row<'grades'>[]
}

export const remarkGrades: Plugin<[RemarkGradesOptions?], Root> = ({ grades } = {}) => {
  const makeBadge = (label: string, grade: Row<'grades'> | null): PhrasingContent => {
    const background = grade == null ? null : getGradeColor(grade)

    return {
      type: 'strong',
      children: [{ type: 'text', value: label }],
      data: {
        hName: 'span',
        hProperties: {
          className: ['badge', 'font-semibold', 'text-white'],
          ...(background == null ? {} : { style: `background: ${background}` }),
        },
      },
    }
  }

  const replaceWithGrade = (label: string, grade: Row<'grades'>): ReplaceFunction => {
    return (...args) => {
      const prefix = typeof args[1] === 'string' ? (args[1] as string) : ''
      const badge = makeBadge(label, grade)
      return prefix.length > 0 ? [{ type: 'text', value: prefix }, badge] : [badge]
    }
  }

  return (tree) => {
    const isBadge = (node: unknown): boolean => {
      const maybeNode = node as {
        data?: { hName?: unknown; hProperties?: { className?: unknown } }
      }

      if (maybeNode?.data?.hName !== 'span') {
        return false
      }

      const className = maybeNode.data?.hProperties?.className
      return Array.isArray(className) ? className.includes('badge') : className === 'badge'
    }

    const replacements = (grades ?? []).toReversed().flatMap((grade) => {
      const arr: FindAndReplaceList = []

      if (grade.FB != null) {
        const fb = grade.FB
        const fbNoSpaces = fb.replaceAll(/\s/g, '')
        const fbSecondToken = fb.split(/\s+/).at(1)

        const replaceFB = replaceWithGrade(fb, grade)
        arr.push([createGradeTokenRegex(fb), replaceFB], [createGradeTokenRegex(fbNoSpaces), replaceFB])

        if (fbSecondToken != null && fbSecondToken.length > 0) {
          arr.push([createGradeTokenRegex(fbSecondToken), replaceFB])
        }
      }

      if (grade.V != null) {
        arr.push([createGradeTokenRegex(grade.V), replaceWithGrade(grade.V, grade)])
      }

      return arr
    })

    findAndReplace(tree, replacements, { ignore: isBadge })
  }
}
