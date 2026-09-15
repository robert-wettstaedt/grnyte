# Social preview

The card is written straight to [`static/og.png`](../../static/og.png), which serves two jobs from
one file: it is the `og:image` the landing page points at, and it is the image uploaded by hand
under Settings, General, Social preview on the GitHub repository. GitHub has no API for that
upload. There is deliberately no second copy in this folder.

`card.html` and `card.css` are the source. They pull the font from `node_modules`, and the logo and
the screenshot from `static`, by absolute path, so the card must be served from the repository root.

## Regenerate

1. Serve the repository root:

   ```bash
   python3 -m http.server 8899 --bind 127.0.0.1
   ```

2. Open `http://127.0.0.1:8899/brand/social/card.html` in a browser.

3. Set the viewport to 1280x640 with a device pixel ratio of 1, then capture the viewport over
   `static/og.png`. A retina display captures at 2560x1280 unless you force the ratio to 1.

4. Keep the file under 1 MB. GitHub rejects a larger one.
