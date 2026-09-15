# NULL FLOOR — v2.0 Escape Build

A Three.js first-person psychological-horror game built around a service corridor that becomes less physically reliable every time the elevator descends.

## v2.0 highlights

- Stable view-relative WASD: `W` is always the direction the player is facing on the horizontal plane; keyboard movement is no longer coupled to the last input device.
- Subtle smoothed walking camera motion with small vertical compression, lateral sway, and sub-degree roll.
- Rebuilt elevator: actual cabin volume, textured sliding doors, jambs/threshold, kick panels, handrails, lighting, physical control panel, call button, indicator, speaker grille, bolts, service placard, arrival/departure animation, and ride sequence.
- Original skeletal horror entities: a standing Stalker and low Crawler with articulated bone hierarchies, painted flesh materials, jaws/teeth, eyes, fingers, authored gaits, attack poses, twitching, stalking, flashlight response, and chase behavior.
- A real escape objective: recover the Fuse on Floor 06, Maintenance Key on Floor 04, and Override Relay on Floor 02; install them on Floor 00 and survive the chase to the elevator.
- Floor checkpoints stored in the browser. Death restarts from the current checkpoint rather than wiping the entire descent.
- Correct Poly Haven glTF dependency resolution through the Poly Haven Files API, fixing the previous guessed texture URLs that could produce 404s/white props.
- Intentional painted fallback materials for any model whose texture cannot be loaded; environment objects should no longer become plain white placeholders.
- Poly Haven environment expansion: electrical boxes, industrial sconces, modular wiring, furniture, luggage, utility props, frames, safety equipment, and worn industrial materials.
- User-supplied Poly Haven wall/floor/door packs remain bundled locally as optimized 2K PBR sets.
- Recorded positional audio, authored anomalies, gamepad support, post-processing, dynamic lighting, and the Floor 00 finale remain integrated.

## Run

```bash
npm install
npm run dev
```

`npm install` installs the dependencies listed in `package.json` (Three.js and Vite). `npm run dev` runs the Vite development script and starts the local web server. Open the **Local** address Vite prints in the terminal.

### Recommended before a release build

```bash
npm run assets
npm run build
npm run preview
```

`npm run assets` executes `tools/cache-assets.mjs` and caches selected Poly Haven models/materials plus recorded audio under `public/assets/`. The new cacher reads Poly Haven's file manifest and downloads every dependency the glTF actually references instead of guessing texture filenames.

`npm run build` creates the optimized Vite production build. `npm run preview` serves that production build locally for final testing.

## Controls

Keyboard/mouse: `W A S D` move, mouse look, `Shift` sprint, `E` interact, `F` flashlight, `Esc` pause.

Gamepad: left stick move, right stick look, `A / Cross` interact, `X / Square` flashlight, `LB` / left-stick click / right trigger sprint, `Menu / Options` pause.

## How the player wins

The descent is no longer just “walk to the next elevator.” Three override components are distributed across the building:

- Floor 06 — Service Fuse
- Floor 04 — Maintenance Key
- Floor 02 — Override Relay

On Floor 00, the player installs all three in the red emergency panel. This powers the lobby elevator but also releases the Stalker into a final chase. The player wins only by physically reaching the open elevator before the creature catches them. The doors close during the escape and the game presents the completed-prologue screen.

## Surface pipeline

The supplied Poly Haven packs are bundled as optimized web textures:

```text
public/assets/surfaces/concrete_wall_004/
public/assets/surfaces/concrete_floor_02/
public/assets/surfaces/rough_pine_door/
```

Each includes 2K diffuse, OpenGL normal, roughness, and height maps. The height map is used as restrained bump detail, avoiding the cost of heavily tessellated geometry.

## Model reliability / white-object fix

Development builds use this order:

1. Locally cached Poly Haven glTF and dependencies.
2. Poly Haven Files API manifest + exact dependency URLs.
3. Legacy direct model path as a last-chance fallback.
4. Deliberately colored PBR fallback materials when a mesh arrives without a diffuse map.

For the commercial build, run `npm run assets` and deploy the resulting local `public/assets/` folder so customers do not depend on third-party model hotlinks.

See `ASSET_SOURCES.md` for provenance and licensing.

## Release status

v2.0 is the strongest playable build so far and the loop is now winnable. It still needs real cross-browser/GPU playtesting and final visual QA on the target hosting environment before taking money. In particular, verify prop scale/orientation, audio loudness, collision edge cases, the final chase difficulty, and production checkout before launch.
