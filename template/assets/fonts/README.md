# Fonts read at build time

Never sent to a browser (the pages load their fonts through `next/font`), and committed, so the build
comes out the same with or without a network. All are under the SIL Open Font License 1.1, licences
alongside.

## For the share images

`lib/og.tsx` draws every Open Graph image with these: static instances, since the image renderer does
not read variable fonts.

| File | Face | Source (sha256) |
|---|---|---|
| `archivo-ec-800.ttf` | Archivo, width 62.5, weight 800 (titles) | Google Fonts CSS2 API, `Archivo:wdth,wght@62.5,800`, the TrueType instance of v25 (`5beb739a…df1799e2`) |
| `archivo-400.ttf` | Archivo, width 100, weight 400 (text) | the same, `Archivo:wdth,wght@100,400` (`021a6dc9…f93cff71`) |
| `noto-georgian-ec-800.ttf` | Noto Sans Georgian, width 62.5, weight 800 | the same, `Noto Sans Georgian:wdth,wght@62.5,800`, v49 (`4192577d…3c5994fe`) |
| `noto-georgian-400.ttf` | Noto Sans Georgian, width 100, weight 400 | the same, `Noto Sans Georgian:wdth,wght@100,400` (`c820da30…4ca32c4b`) |
| `ibm-plex-mono-400.ttf` | IBM Plex Mono Regular (install commands) | `ofl/ibmplexmono/IBMPlexMono-Regular.ttf` in github.com/google/fonts at commit 633f320, unmodified (`6a3412f0…7a27734af46`) |

The instances are whole, as Google Fonts serves them: Archivo with Latin, Latin Extended and
Vietnamese; Noto Sans Georgian with Georgian, Latin, Latin Extended and ₾. IBM Plex is committed whole
too: its licence reserves the name "Plex", and a subset is a modified version that could not keep it.
A character none of them has is left out of the image, and the build log names it (`lib/og.tsx`).

## For the name's fit

`web/` holds the files the pages draw with: the WOFF2 files Google Fonts serves for `next/font`, one
per subset (variable on width and weight), copied unmodified from what `next build` downloaded.
`lib/type-metrics.ts` reads each glyph's advance and the kerning from them at the axis values the
masthead and the Work page's amount are set at, and `lib/fit.ts` sizes the name from that.

| File | Subset (its unicode-range is in `lib/fit.ts`) | sha256 |
|---|---|---|
| `web/archivo-latin.woff2` | Archivo, latin | `4c98b9d4…45afe5ad` |
| `web/archivo-latin-ext.woff2` | Archivo, latin-ext | `a75c792f…d8712a08` |
| `web/archivo-vietnamese.woff2` | Archivo, vietnamese | `e6571148…ebd17772` |
| `web/noto-georgian-georgian.woff2` | Noto Sans Georgian, georgian | `0b023329…ccc8f920` |
| `web/noto-georgian-latin.woff2` | Noto Sans Georgian, latin | `169e4204…13dd670b` |
| `web/noto-georgian-latin-ext.woff2` | Noto Sans Georgian, latin-ext | `850e1b39…5bd7f048` |

`next/font` downloads the fonts again at every build, so if Google Fonts ever changes a family, the
pages draw the new version while the fit is measured from these. `pnpm qa` (through `pnpm fit`) draws
the names in the built pages and measures them, so such a change shows there: copy the new files from
`.next/static/media/` (the ones whose `@font-face` in the built CSS has the subset's unicode-range).
