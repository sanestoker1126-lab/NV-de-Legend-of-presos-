# Puente Grande — Epic mobile UX and PixiJS migration

## Guardrails
- Preserve `src/engine.js` combat simulation and its deterministic behavior; rendering migration must not alter hit outcomes or combat timers.
- Preserve the validated `public/assets/catalog.json` and all original resource hashes. Do not add a sprite merely because it exists; an atlas must pass identity, transparency, frame-integrity, scale, foot-baseline, and animation-state mapping checks.
- Do not replace the main branch directly. Work in `feat/pixi-epic-mobile-ux` and open a reviewable PR after builds/tests pass.
- Keep a fallback path during rendering migration until visual parity is checked.

## UI direction
- Compact "prison-yard arcade" identity: charcoal/black, signal red-orange, restrained metal/grit details, tight typography, no oversized empty hero column.
- Keep the primary play action visible without scrolling on common mobile portrait screens; no overlay or info bar may cover it.
- On mobile combat, respect safe-area insets, keep the arena responsive and preserve portrait usability. Controls anchor to the safe bottom region; movement cluster left, action cluster right; avoid horizontal overflow and minimum 44px touch targets.
- Support resize, orientationchange, visualViewport resize, blur/visibility pause, reduced motion, and pointer cancellation.
- Prioritize clear hierarchy, responsive layout, accessible focus states, readable HUD, and clear startup/loading/error states.

## PixiJS migration sequence
1. Add PixiJS as a project dependency and create a renderer adapter around the current canvas bounds.
2. Move background, fighter sprites, shadows, block/special feedback, and particles into Pixi display containers.
3. Keep UI/HUD HTML overlays and keep engine.js as the single source of combat state.
4. Keep the same asset catalog and validate that source rectangles, frame selection, mirroring, scale and feet anchors match the current renderer.
5. Add texture lifecycle/caching and teardown; prefer sprites/graphics reuse over per-frame allocation.
6. Compare the old renderer and PixiJS scene at identical simulated states before removing the old canvas renderer.

## Atlas admission gate
A candidate atlas is accepted only when:
- character identity is verified against its source;
- frames are not cropped at feet/limbs and transparency is correct;
- there are no obvious foreign-character frames or duplicate filler poses;
- pivot/ground baseline and per-animation state mapping are documented;
- atlas coordinates fit the source and frame counts agree with the manifest;
- performance and visual QA pass on a phone-class viewport.

## Definition of done
- `npm run verify:assets`
- `npm test`
- `npm run test:e2e`
- `npm run build` and `npm run build:pages`
- Play, character selection, stage selection, start, pause/resume, round transition, rematch, keyboard controls and touch controls all work.
- Tested at narrow portrait (360px), standard portrait (390px), landscape mobile, and desktop. No blocking overlay or clipped control.
- PR includes screenshots/notes and clearly distinguishes implemented, tested, and pending items.


## WebGL regression checks

- The Pixi canvas keeps the `game-canvas` selector for compatibility with existing browser checks.
- Pixel-based browser tests read back the WebGL canvas through a separate 2D canvas; they must not request a 2D context from the Pixi canvas itself.
- All combat atlases and stage textures are preloaded once; stage changes reuse the loaded texture and do not create duplicate background sprites.
- The Pixi draw loop is synchronous after preload, and frame textures are cached by atlas URL, row and column.


## Combat feedback parity

- The PixiJS renderer reuses a per-fighter `Graphics` object for guard and special-move arcs, preserving the visual cues from the former 2D canvas renderer.
- Guard arcs use the legacy cool-blue shield cue; special moves use a pulsing orange arc unless reduced motion is enabled.
- These effects are presentation-only and do not alter combat simulation, damage, hitboxes, or timers.
