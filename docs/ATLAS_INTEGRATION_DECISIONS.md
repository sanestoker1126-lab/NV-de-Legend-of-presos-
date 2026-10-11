# Atlas integration decisions for the PixiJS branch

This file records decisions from the prior atlas QA work. Runtime additions must preserve character identity and use explicit frame coordinates; a contact sheet is not automatically a production atlas.

## Activated in this branch

- **Tobi, 81 frames, 9×9 at 120×120:** registered the final row (row 8) as a victory animation in `public/assets/catalog.json`. The Pixi renderer now plays that animation when Tobi wins a completed match. Existing runtime atlas dimensions are 1080×1080 and fit the 9×9 geometry. The actual WebP asset should still be compared byte-for-byte or frame-by-frame against the original PNG before treating the image conversion as fully cleared.

## Best next additions from prior QA

- **Estoker V3 Engine Ready:** 103-frame master, explicit move names, 0 near-duplicate pairs in the prior audit, plus 46 special/super/victory frames. Use this V3 package, not the older staging build that is missing frame 43. It is not activated in this Pixi roster yet because its source atlas and metadata are not present under `public/assets` in this branch.
- **Wasa V4 Engine Ready:** 56 base frames + 16 specials, 72 total, with JASSO/JSON metadata and previously reported 0 out-of-bounds rectangles. Its frame rectangles are variable, so it needs the variable-rectangle Pixi adapter before activation. Do not add a second 56-frame base from the superseded package.
- **LUCHADOR08 mapped JASSO:** 90 body frames + 21 FX; keep staged until its combat states are explicitly mapped. Do not infer idle/light/heavy states from filenames alone.

## Keep out of runtime

- `FRAMES_CONTORNO_CATALOGO_135.zip`: 135 contour-extracted poses, but its own catalog marks movement groups as provisional, includes multiple source-sheet IDs and some source effects/rival composition. It is useful for review and frame recovery, not as one character atlas.
- `FRAMES_IDLE_SOMBRA_120_V2.zip`: idle-scale/shadow reference package, not runtime character art.
- `DON_GARRA_ATLAS_FINAL_81F_9x9.png`: keep separate until its frame extraction/edge artifacts and identity mapping are verified against the actual Garravas runtime asset.

## Activation gate

A new atlas may enter the active roster only after confirming: correct character identity, transparent background, intact feet/silhouette, stable baseline/pivot, frame bounds, explicit animation mapping, no invented or duplicated frames, and browser rendering without asset errors.
