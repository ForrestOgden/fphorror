# NULL FLOOR — v2.1 Interaction Build

A Three.js first-person psychological-horror game built around a service corridor that becomes less physically reliable every time the elevator descends.

## v2.1 highlights

- Every apartment door is now physically interactable. Aim at the knob and press `E` / `A` to try it.
- Most doors are locked. Locked doors visibly jiggle, play a latch/knob response, and display `THE DOOR IS LOCKED`.
- Three doors across the descent are genuinely enterable, with actual portal openings and room collision rather than fake rooms behind solid walls.
- Floor 06 — Apartment 013: furnished tenant room containing the Service Fuse.
- Floor 04 — Maintenance room: industrial equipment, Maintenance Key, and an optional Poly Haven pipe wrench.
- Floor 02 — Utility room: electrical/service dressing containing the Override Relay.
- Room decoration follows deliberate placement logic: furniture against usable walls, working areas grouped together, rubbish in corners, fire equipment bracketed, wiring associated with electrical panels, and sconces assembled with mounts/conduit/light sources.
- Pipe wrench melee: left click / `B` or Circle swings it. A close, aimed hit briefly stuns and pushes back the beast. The improvised weapon only survives three solid hits.
- Adaptive threat drone: a low dissonant background bed grows louder, brighter, and less stable as the creature approaches and as the player descends.
- Walking camera motion is slightly stronger than v2.0 while remaining restrained.
- Stable view-relative WASD remains in place: `W` is always horizontal camera-forward, with axis-separated collision for predictable wall sliding.
- The rebuilt elevator, Floor 00 escape objective, checkpoints, recorded positional audio, gamepad support, authored anomalies, and post-processing remain integrated.
- Poly Haven models use their actual glTF dependency manifests, with local caching and deliberate fallback materials to prevent white/untextured props.
- User-supplied Poly Haven wall/floor/door packs remain bundled locally as optimized 2K PBR sets.

## Run

```bash
npm install
npm run dev
```

`npm install` installs the dependencies listed in `package.json` (Three.js and Vite). `npm run dev` starts the Vite development server. Open the **Local** address Vite prints in the terminal.

### Recommended before a release build

```bash
npm run assets
npm run build
npm run preview
```

`npm run assets` runs `tools/cache-assets.mjs` and caches selected Poly Haven models/materials plus recorded audio under `public/assets/`. The cacher reads Poly Haven's file manifest and downloads every dependency referenced by each glTF instead of guessing texture filenames.

`npm run build` creates the optimized Vite production build. `npm run preview` serves that production build locally for final testing.

## Controls

Keyboard/mouse: `W A S D` move, mouse look, `Shift` sprint, `E` interact/try door, `F` flashlight, left click use melee weapon when carried, `Esc` pause.

Gamepad: left stick move, right stick look, `A / Cross` interact/try door, `B / Circle` melee, `X / Square` flashlight, `LB` / left-stick click / right trigger sprint, `Menu / Options` pause.

## How the player wins

The player must search the building rather than simply reach each elevator:

- Floor 06 — enter Apartment 013 and recover the Service Fuse.
- Floor 04 — enter the Maintenance room and recover the Maintenance Key; the pipe wrench is optional.
- Floor 02 — enter the Utility room and recover the Override Relay.

On Floor 00, install all three components in the red emergency panel. This powers the lobby elevator but releases the Stalker into the final chase. The player wins only by physically reaching the open elevator before the creature catches them.

## Surface pipeline

The supplied Poly Haven packs are bundled as optimized web textures:

```text
public/assets/surfaces/concrete_wall_004/
public/assets/surfaces/concrete_floor_02/
public/assets/surfaces/rough_pine_door/
```

Each includes 2K diffuse, OpenGL normal, roughness, and height maps. Height is used as restrained bump detail rather than expensive high-density displacement geometry.

## Model reliability / white-object fix

Development builds use this order:

1. Locally cached Poly Haven glTF and dependencies.
2. Poly Haven Files API manifest + exact dependency URLs.
3. Legacy direct model path as a last-chance fallback.
4. Deliberately colored PBR fallback materials when a mesh arrives without a diffuse map.

For the commercial build, run `npm run assets` and deploy the resulting local `public/assets/` folder so customers do not depend on third-party model hotlinks.

See `ASSET_SOURCES.md` for provenance and licensing.

## Creature model slot

The runtime already imports `GLTFLoader`. A production monster should preferably be supplied as a `.glb` containing mesh, skeleton, materials/textures, and animation clips. `.gltf` with dependencies or FBX can also be adapted. The current procedural Stalker/Crawler remain fallbacks until the final authored creature asset is integrated.

## Release status

v2.1 adds the first real exploration/interior layer and substantially improves environmental believability. It still needs real browser/GPU playtesting and final visual QA before charging customers. Verify room doorway collision, prop scale/orientation, audio loudness, door readability, melee balance, monster animation integration, final chase difficulty, and production checkout before launch.
