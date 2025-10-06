export function calculateRelevance(option: string, query: string): number {
  const optionLower = option.toLowerCase()
  const queryLower = query.toLowerCase()

  // Exact match gets highest score
  if (optionLower === queryLower) return 1000

  // Starts with query gets high score
  if (optionLower.startsWith(queryLower)) return 800

  // Contains query as whole word gets medium-high score
  if (optionLower.includes(' ' + queryLower) || optionLower.includes(queryLower + ' ')) return 600

  // Simple contains gets medium score
  if (optionLower.includes(queryLower)) return 400

  // Fuzzy matching - check if all characters of query appear in order
  let queryIndex = 0
  let score = 200

  for (let i = 0; i < optionLower.length && queryIndex < queryLower.length; i++) {
    if (optionLower[i] === queryLower[queryIndex]) {
      queryIndex++
      // Bonus for consecutive matches
      if (i > 0 && optionLower[i - 1] === queryLower[queryIndex - 2]) {
        score += 50
      }
    }
  }

  // All characters found in order
  if (queryIndex === queryLower.length) {
    // Bonus for shorter strings (more relevant)
    score += Math.max(0, 100 - option.length)
    return score
  }

  return 0 // No match
}
