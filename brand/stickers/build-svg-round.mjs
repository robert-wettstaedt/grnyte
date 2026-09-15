// Emits the round print master at true size in millimetres.
// A circle is a harder container than a rectangle: the widest line of the tagline sits below the
// centre, where the chord is already narrowing. Every text corner is checked against the safe
// circle below rather than trusted.
import fs from 'node:fs'

const rel = (n) => new URL(n, import.meta.url)
const round = (n) => +n.toFixed(4)

// --- page -------------------------------------------------------------------
const DIAMETER = 50
const BLEED = 3
const SAFE = 4
const BOARD = DIAMETER + BLEED * 2
const centre = BOARD / 2
const safeR = DIAMETER / 2 - SAFE

// --- ring -------------------------------------------------------------------
// A sandy band lifted from the mark. It fills everything outside its inner edge, bleed included,
// so a cut that drifts by a few tenths only changes the band's width instead of exposing purple.
const RING_W = Number(process.env.RING_W ?? 2.5)
// The mark's lightest face. It converts to roughly C2 M1 Y10 K0, which is a very light tint over a
// large area: if the first run comes back mottled, lift it a few percent rather than redesigning.
const RING_COLOUR = process.env.RING_COLOUR ?? '#FAF9E9'
const ringInnerR = DIAMETER / 2 - RING_W

// --- type -------------------------------------------------------------------
// Measured widths and ink extents per em, letter-spacing included.
const RATIO = { tagline: 8.007, wordmark: 3.093 }
const INK = { tagAsc: 0.7, tagDesc: 0.2, wordAsc: 0.65, wordDesc: 0.2 }

// The tagline is the widest element and sits lowest, where the chord is already narrowing, so it
// is the binding constraint. The mark has headroom near the centre and takes the space instead.
const wordSize = 6
const tagSize = 3.45
const TAG_LH = 1.15
const ROCK_H = 15
const ROCK_TO_WORD = 1.5 // clear space, mark bottom to wordmark ascender top
const WORD_TO_TAG = 4.9 // wordmark baseline to first tagline baseline

// --- stack ------------------------------------------------------------------
const ROCK_VB = { h: 368.5, w: 378.6, x: 69.3, y: 74.2 }
const rockW = ROCK_H * (ROCK_VB.w / ROCK_VB.h)
const rockScale = rockW / ROCK_VB.w

const tagBoxH = tagSize * TAG_LH
const wordInkTopOffset = ROCK_H + ROCK_TO_WORD
const wordBaselineOffset = wordInkTopOffset + wordSize * INK.wordAsc
const tagBaseline1Offset = wordBaselineOffset + WORD_TO_TAG
const tagBaseline2Offset = tagBaseline1Offset + tagBoxH
const inkH = tagBaseline2Offset + tagSize * INK.tagDesc

const top = centre - inkH / 2
const wordBaseline = top + wordBaselineOffset
const tagBaseline1 = top + tagBaseline1Offset
const tagBaseline2 = top + tagBaseline2Offset

// --- fit check --------------------------------------------------------------
// Half-width of the safe circle at a given y. Negative clearance means the art escapes it.
const halfChord = (y) => {
  const d = Math.abs(y - centre)
  return d >= safeR ? -Infinity : Math.sqrt(safeR * safeR - d * d)
}
const clearance = (y, halfWidth) => halfChord(y) - halfWidth

const probes = [
  ['mark top', top, rockW / 2],
  ['mark bottom', top + ROCK_H, rockW / 2],
  ['wordmark top', top + wordInkTopOffset, (wordSize * RATIO.wordmark) / 2],
  ['wordmark bottom', wordBaseline + wordSize * INK.wordDesc, (wordSize * RATIO.wordmark) / 2],
  ['tagline 1 top', tagBaseline1 - tagSize * INK.tagAsc, (tagSize * RATIO.tagline) / 2],
  ['tagline 2 bottom', tagBaseline2 + tagSize * INK.tagDesc, (tagSize * RATIO.tagline) / 2],
]
const worst = probes.reduce((a, p) => Math.min(a, clearance(p[1], p[2])), Infinity)

// --- art --------------------------------------------------------------------
const rockPaths = fs
  .readFileSync(rel('rock.svg'), 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/\s(class|style)="[^"]*"/g, '')
  .trim()

const svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
  width="${BOARD}mm" height="${BOARD}mm" viewBox="0 0 ${BOARD} ${BOARD}">
  <title>grnyte sticker, ${DIAMETER} mm round, purple</title>

  <!-- sandy to the edge of the board, purple disc on top: the cut falls inside the sandy band -->
  <rect x="0" y="0" width="${BOARD}" height="${BOARD}" fill="${RING_COLOUR}"/>
  <circle cx="${centre}" cy="${centre}" r="${round(ringInnerR)}" fill="#8E43B2"/>

  <g transform="translate(${round(centre - rockW / 2 - ROCK_VB.x * rockScale)} ${round(top - ROCK_VB.y * rockScale)}) scale(${round(rockScale)})">
    ${rockPaths}
  </g>

  <text x="${round(centre)}" y="${round(wordBaseline)}" fill="#FFFFFF" text-anchor="middle"
    font-family="Space Grotesk" font-weight="700" font-size="${round(wordSize)}"
    letter-spacing="${round(wordSize * -0.03)}">grnyte</text>

  <text x="${round(centre)}" y="${round(tagBaseline1)}" fill="#FFFFFF" text-anchor="middle"
    font-family="Space Grotesk" font-weight="500" font-size="${round(tagSize)}">Private topos</text>
  <text x="${round(centre)}" y="${round(tagBaseline2)}" fill="#FFFFFF" text-anchor="middle"
    font-family="Space Grotesk" font-weight="500" font-size="${round(tagSize)}">for private crags</text>
</svg>
`

fs.writeFileSync(rel('sticker-purple-round.svg'), svg)

console.log(
  JSON.stringify(
    {
      boardMm: BOARD,
      clearances: Object.fromEntries(probes.map((p) => [p[0], round(clearance(p[1], p[2]))])),
      gapToRingMm: round(ringInnerR - (safeR - worst)),
      inkHeightMm: round(inkH),
      markMm: { h: ROCK_H, w: round(rockW) },
      ring: { colour: RING_COLOUR, innerRadiusMm: round(ringInnerR), widthMm: RING_W },
      taglineWidthMm: round(tagSize * RATIO.tagline),
      tightestClearanceMm: round(worst),
    },
    null,
    2,
  ),
)
