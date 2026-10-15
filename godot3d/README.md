# Puente Grande 3D · Godot prototype

This is an isolated Godot 4 project under `godot3d/`. It does not replace the existing browser game, its PixiJS renderer, its asset catalog, or the 2D `MASTER-CORE-011` branch.

## Current vertical slice

- Native Godot 3D arena with floor collision, camera, and sprite-based fighters over physical collision bodies.
- Integrated 41 character atlas files, 7 VFX atlas sheets, and the shared catalog metadata under `assets/`.
- Tobi and Mateo currently use their atlas frames for idle, movement, attacks, jump/hurt where mapped; other imported atlases are staged for roster expansion and verified animation mapping.
- Player movement, jump, punch, kick, guard, special attack, MAX state, health bars, power meter, and round timer.
- Simple CPU opponent and touch-screen buttons.
- 60 Hz physics configuration and fighter collision bodies.

## Controls

- Move: **A / D** or **Left / Right**
- Jump: **W / Space**
- Guard: **S**
- Punch: **J**
- Kick: **K**
- Special: **L** (costs 35 energy)
- MAX: **M** (costs 80 energy, lasts 10 seconds)

On-screen controls are also available for touch input.

## Open the project

1. Install a stable Godot 4.x build.
2. In Godot, import/open this folder: `godot3d/`.
3. Run `scenes/main.tscn`.

## Explicitly not finished

The atlas integration currently animates Tobi and Mateo as 2D sprite planes in the 3D arena; only their mapped rows are wired into gameplay. Other imported character and VFX atlases are not yet connected to moves. Some catalog animation mappings are inferred from visual inspection and still need frame-by-frame QA. This prototype has not yet been run in the Godot editor or exported to Android in the current automation environment. Android export templates, signing, real character models/animations, round flow, sound, and device performance validation remain pending. The target Android package identifier is `com.puentegrande.legendofpresos3d`.

Do not treat this as a release APK. It is the first isolated native 3D combat slice, kept separate so the existing browser game remains intact.
