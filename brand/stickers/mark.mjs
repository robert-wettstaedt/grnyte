// The logo is a rock glyph sitting on a purple rounded-square tile. On a rounded-square sticker
// that tile reads as a second frame, so this writes a tile-less variant for use on the stickers.
import fs from 'node:fs'

const src = fs.readFileSync(new URL('../../static/logo.svg', import.meta.url), 'utf8')
const tile = src.match(/<path[^>]*fill="#8E43B2"><\/path>/)
if (!tile) throw new Error('purple tile path not found')

// Tightened to the glyph's measured bounding box, so the mark fills whatever box it is given
// instead of floating inside the tile's old padding.
const rock = src
  .replace(tile[0], '')
  .replace('viewBox="0 0 512 512"', 'viewBox="69.3 74.2 378.6 368.5"')
  .replace(/width="\d+" height="\d+"/, 'width="379" height="369"')
fs.writeFileSync(new URL('rock.svg', import.meta.url), rock)

const paths = (rock.match(/<path/g) || []).length
console.log('rock.svg written, paths:', paths)
