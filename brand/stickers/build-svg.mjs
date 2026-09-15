// Emits the print master as a real SVG at true size in millimetres.
// Baselines are derived from measured Space Grotesk ink extents rather than guessed, so the type
// sits where the layout says it does.
import fs from 'node:fs'

const rel = (n) => new URL(n, import.meta.url)
const round = (n) => +n.toFixed(4)

// --- page -------------------------------------------------------------------
const TRIM_W = 60
const TRIM_H = 40
const BLEED = 3
const FULL_W = TRIM_W + BLEED * 2
const FULL_H = TRIM_H + BLEED * 2
const centreX = FULL_W / 2
const centreY = FULL_H / 2

// --- type -------------------------------------------------------------------
// Measured widths per unit of font-size, letter-spacing included.
const RATIO = { tagline: 8.007, wordmark: 3.093 }

// Measured ink extents per em. A line box is much taller than lowercase letterforms, so matching
// boxes to the mark leaves the text visibly shorter. These make "same height" mean same ink.
const INK = { tagAsc: 0.7, tagDesc: 0.2, wordAsc: 0.65, wordDesc: 0.2 }

const wordSize = 7.35
const tagSize = 3.78
const TAG_LH = 1.15
const WORD_TO_TAG = 5.8 // wordmark baseline to first tagline baseline
const ROW_GAP = 3.5

// --- lockup: mark on the left, wordmark over tagline on the right ------------
// The text column sets the height and the mark is scaled to match it, which is what makes the
// two halves read as one block rather than two things that happen to be adjacent.
const tagBoxH = tagSize * TAG_LH
const textH = wordSize * INK.wordAsc + WORD_TO_TAG + tagBoxH + tagSize * INK.tagDesc
const textW = Math.max(wordSize * RATIO.wordmark, tagSize * RATIO.tagline)

const ROCK_VB = { h: 368.5, w: 378.6, x: 69.3, y: 74.2 }
const rockH = textH
const rockW = rockH * (ROCK_VB.w / ROCK_VB.h)
const rockScale = rockW / ROCK_VB.w

const rowW = rockW + ROW_GAP + textW
const rowLeft = centreX - rowW / 2
const rowTop = centreY - textH / 2
const textLeft = rowLeft + rockW + ROW_GAP

const wordBaseline = rowTop + wordSize * INK.wordAsc
const tagBaseline1 = wordBaseline + WORD_TO_TAG
const tagBaseline2 = tagBaseline1 + tagBoxH

// --- art --------------------------------------------------------------------
const rockPaths = fs
  .readFileSync(rel('rock.svg'), 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace(/\s(class|style)="[^"]*"/g, '')
  .trim()

const svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"
  width="${FULL_W}mm" height="${FULL_H}mm" viewBox="0 0 ${FULL_W} ${FULL_H}">
  <title>grnyte sticker 60x40 mm, purple</title>

  <!-- bleed: the purple runs to the edge of the board, 3 mm past the cut -->
  <rect x="0" y="0" width="${FULL_W}" height="${FULL_H}" fill="#8E43B2"/>

  <g transform="translate(${round(rowLeft - ROCK_VB.x * rockScale)} ${round(rowTop - ROCK_VB.y * rockScale)}) scale(${round(rockScale)})">
    ${rockPaths}
  </g>

  <text x="${round(textLeft)}" y="${round(wordBaseline)}" fill="#FFFFFF"
    font-family="Space Grotesk" font-weight="700" font-size="${round(wordSize)}"
    letter-spacing="${round(wordSize * -0.03)}">grnyte</text>

  <text x="${round(textLeft)}" y="${round(tagBaseline1)}" fill="#FFFFFF"
    font-family="Space Grotesk" font-weight="500" font-size="${round(tagSize)}">Private topos</text>
  <text x="${round(textLeft)}" y="${round(tagBaseline2)}" fill="#FFFFFF"
    font-family="Space Grotesk" font-weight="500" font-size="${round(tagSize)}">for private crags</text>
</svg>
`

fs.writeFileSync(rel('sticker-purple.svg'), svg)

console.log(
  JSON.stringify(
    {
      clearBetweenWordAndTaglineMm: round(
        tagBaseline1 - tagSize * INK.tagAsc - (wordBaseline + wordSize * INK.wordDesc),
      ),
      markMm: { h: round(rockH), w: round(rockW) },
      rowWidthMm: round(rowW),
      sideMarginFromTrimMm: round(rowLeft - BLEED),
      textInkHeightMm: round(textH),
      textWidthMm: round(textW),
    },
    null,
    2,
  ),
)
