import { getGradeColor } from '$lib/entities/grade/color'
import type { Grade } from '$lib/entities/grade/dto'
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
  grades?: Grade[]
}

export const remarkGrades: Plugin<[RemarkGradesOptions?], Root> = ({ grades } = {}) => {
  const makeBadge = (label: string, grade: Grade | null): PhrasingContent => {
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

  const replaceWithGrade = (label: string, grade: Grade): ReplaceFunction => {
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

      // Skip blank tokens: an empty grade label (e.g. a V-only grade row where
      // `FB` is '') would build a zero-width regex that matches everywhere and
      // sends `findAndReplace` into an infinite loop once a badge is inserted.
      const pushToken = (token: string, replace: ReplaceFunction) => {
        if (token.trim().length > 0) {
          arr.push([createGradeTokenRegex(token), replace])
        }
      }

      if (grade.FB != null) {
        const fb = grade.FB
        const replaceFB = replaceWithGrade(fb, grade)
        pushToken(fb, replaceFB)
        pushToken(fb.replaceAll(/\s/g, ''), replaceFB)
        pushToken(fb.split(/\s+/).at(1) ?? '', replaceFB)
      }

      if (grade.V != null) {
        pushToken(grade.V, replaceWithGrade(grade.V, grade))
      }

      return arr
    })

    findAndReplace(tree, replacements, { ignore: isBadge })
  }
}
