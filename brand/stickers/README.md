# Stickers

Two formats, same artwork: the mark, the wordmark and the tagline on purple. There is deliberately
no QR code and no address, so a sticker is a badge and not a route to the site.

| Format      | Print file                                     | Board size | Saxoprint product              |
| ----------- | ---------------------------------------------- | ---------- | ------------------------------ |
| 50 mm round | `grnyte-sticker-50mm-round-purple-FOGRA51.pdf` | 56 x 56 mm | Runde Aufkleber, standard cut  |
| 60 x 40 mm  | `grnyte-sticker-60x40-purple-FOGRA51.pdf`      | 66 x 46 mm | Aufkleber rechteckig, from 250 |

The round one is the better sticker and the cheaper one: a circle reads as a sticker rather than a
label, it has no corners to lift, and it is cut with a standard tool, so it avoids the surcharge on
contour cutting. Saxoprint quoted 500 at 50 x 50 mm for EUR 31.33 and 1,000 for EUR 41.83. Their
price jumps steeply at 60 mm, so 50 mm is the size to take.

Each board is the cut size plus 3 mm of bleed on every side. Text is converted to paths, so no font
has to be installed anywhere. Colours are CMYK under PSO Coated v3 (FOGRA51). The matching
`-300dpi.png` files are the same artwork for Sticker Mule and StickerApp, which convert colours
themselves.

## The ring

The round sticker carries a 2.5 mm band of `#FAF9E9`, the mark's lightest face, so the surface is
not one flat field. The sandy colour fills everything outside the band's inner edge, bleed
included, and the purple disc sits on top. The cut therefore falls **inside** the sandy area: a cut
that drifts a few tenths only changes the band's width slightly, instead of exposing purple on one
side.

That colour converts to about C2 M1 Y10 K0. As a facet on the mark it is fine; as a band running
the whole circumference it is a very light tint over a large area, which is where offset can print
unevenly. If the first run comes back mottled, lift the tint a few percent rather than redesigning.
`RING_COLOUR` and `RING_W` override both without editing the file.

## The circle constrains the layout

The tagline is the widest element and it sits below the centre, where the chord of the circle is
already narrowing. It is therefore what limits every other size. `build-svg-round.mjs` checks each
corner of the art against a safe circle 4 mm inside the cut and prints the clearances, so a change
that pushes something over the edge shows up as a number rather than on delivery.

## The purple is set by hand

The brand violet `#8E43B2` is outside the CMYK gamut, so a profile conversion returns a duller
colour (C61 M81 Y0 K0). Both files ship **C70 M95 Y0 K0** instead, which keeps the same hue and
moves toward the edge of the gamut. Nobody has proofed it on a press yet, so treat it as a starting
point and check it against the first run.

`fix-colors.py` applies the substitution after the conversion. It also replaces a rich black with
100 % K if it finds one, which this artwork no longer contains.

## Rebuild

You need Inkscape, Ghostscript and the PSO Coated v3 profile. The profile is a free download from
<https://www.eci.org/en/downloads>. Ghostscript looks for all of its profiles in one directory, so
copy its own `default_*.icc` files next to `PSOcoated_v3.icc` first, or it fails with "Unable to
open the initial device".

Inkscape needs Space Grotesk to outline the text. Install the font, or point `FONTCONFIG_FILE` at a
config that lists a directory holding it.

1. Write the tile-less mark to `rock.svg`. The logo sits on a purple rounded square, which reads as
   a second frame on a purple sticker, so this strips it:

   ```bash
   node mark.mjs
   ```

2. Write an SVG master. `build-svg-round.mjs` for the circle, `build-svg.mjs` for the rectangle:

   ```bash
   node build-svg-round.mjs
   ```

3. Convert the text to paths:

   ```bash
   inkscape sticker-purple-round.svg --export-type=pdf --export-text-to-path \
     --export-filename=sticker-rgb.pdf
   ```

4. Convert the colours to CMYK, where `ICC` is the directory holding the profiles:

   ```bash
   gs -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK \
     -sColorConversionStrategy=CMYK -sICCProfilesDir="$ICC/" \
     -sOutputICCProfile=PSOcoated_v3.icc -dRenderIntent=1 \
     -o sticker-cmyk.pdf sticker-rgb.pdf
   ```

5. Set the purple, then rewrite the file structure:

   ```bash
   python3 fix-colors.py sticker-cmyk.pdf patched.pdf
   gs -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dProcessColorModel=/DeviceCMYK \
     -sColorConversionStrategy=LeaveColorUnchanged \
     -o grnyte-sticker-50mm-round-purple-FOGRA51.pdf patched.pdf
   ```

   Step 5 reports that the file does not conform to the PDF specification. That is expected:
   `fix-colors.py` edits bytes inside the content stream, and this pass repairs the structure.

## Before you order

Saxoprint prints stickers in four-colour offset with no spot colours. Sticker Mule prints digitally
from 10 pieces. The two processes do not produce the same purple, so a digital proof does not tell
you how the offset run will look.

Contour cutting to a custom outline is a different Saxoprint product, from 5 pieces, but it costs
roughly three times a standard cut, comes only in eight fixed formats, and needs the cut path as a
named spot colour set to overprint, which Inkscape cannot author and Ghostscript would flatten.
That route needs Illustrator, InDesign or Scribus.
