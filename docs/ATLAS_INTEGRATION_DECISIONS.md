# Atlas integration decisions for the PixiJS branch

This file records decisions from prior atlas QA. Runtime additions must preserve character identity and use explicit frame coordinates; a contact sheet is not automatically a production atlas.

## Best next additions from prior QA

- **Estoker V3 Engine Ready:** 103-frame master, explicit move names, 0 near-duplicate pairs in the prior audit, plus 46 special/super/victory frames. Use this V3 package, not the older staging build that is missing frame 43. It is not active in this Pixi roster because its source atlas and metadata are not yet present under `public/assets` in this branch.
- **Wasa V4 Engine Ready:** 56 base frames + 16 specials, 72 total, with JASSO/JSON metadata and previously reported 0 out-of-bounds rectangles. Its frame rectangles are variable, so it needs the variable-rectangle Pixi adapter before activation. Do not add a second 56-frame base from the superseded package.
- **Tobi final 81-frame atlas:** 9×9 cells at 120×120 with explicit movement metadata. The source PNG in the library is visually clean, but the current runtime WebP files show visible color-block/streak artifacts in inspection. Keep the extra victory row disabled until a clean source atlas replaces the converted runtime file.
- **LUCHADOR08 mapped JASSO:** 90 body frames + 21 FX; keep staged until its combat states are explicitly mapped. Do not infer idle/light/heavy states from filenames alone.

## Keep out of runtime

- `FRAMES_CONTORNO_CATALOGO_135.zip`: 135 contour-extracted poses, but its own catalog marks movement groups as provisional, includes multiple source-sheet IDs and some source effects/rival composition. It is useful for review and frame recovery, not as one character atlas.
- `FRAMES_IDLE_SOMBRA_120_V2.zip`: idle-scale/shadow reference package, not runtime character art.
- `DON_GARRA_ATLAS_FINAL_81F_9x9.png`: keep separate until its frame extraction/edge artifacts and identity mapping are verified against the actual Garravas runtime asset.

## Activation gate

A new atlas may enter the active roster only after confirming: correct character identity, transparent background, intact feet/silhouette, stable baseline/pivot, frame bounds, explicit animation mapping, no invented or duplicated frames, and browser rendering without asset errors.
