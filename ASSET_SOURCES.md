# NULL FLOOR v2.0 — Asset Sources & License Manifest

The environment-art pipeline is standardized primarily around **Poly Haven CC0** assets. The game keeps provenance here even where attribution is not legally required.

## Bundled local Poly Haven surface packs

These user-supplied Poly Haven source packs were converted into optimized 2K runtime PBR materials and are included locally:

- `concrete_wall_004` — corridor wall material — https://polyhaven.com/a/concrete_wall_004
- `concrete_floor_02` — corridor floor material — https://polyhaven.com/a/concrete_floor_02
- `rough_pine_door` — apartment-door material — https://polyhaven.com/a/rough_pine_door

Runtime derivative folders:

```text
public/assets/surfaces/concrete_wall_004/
public/assets/surfaces/concrete_floor_02/
public/assets/surfaces/rough_pine_door/
```

## Poly Haven PBR materials

- `worn_plaster_wall` — fallback wall surface
- `worn_tile_floor` — fallback floor surface
- `ceiling_interior` — ceiling
- `metal_plate_02` — elevator cabin steel
- `metal_grate_rusty` — elevator floor
- `painted_metal_shutter` — elevator sliding doors

All are sourced from `https://polyhaven.com/a/<asset-id>`.

## Poly Haven models

The v2 cache/runtime loader supports:

- `WoodenChair_01`
- `painted_wooden_chair_02`
- `painted_wooden_cabinet`
- `vintage_suitcase`
- `metal_trash_can`
- `trashbag`
- `industrial_wall_lamp`
- `industrial_caged_sconce`
- `fancy_picture_frame_01`
- `painted_wooden_bench`
- `cardboard_box_01`
- `korean_fire_extinguisher_01`
- `small_wooden_table_01`
- `power_box_01`
- `utility_box_01`
- `modular_electric_cables`
- `security_camera_01`
- `fire_alarm`
- `barrel_03`
- `can_rusted`
- `pipe_wrench`

The new loader no longer guesses a model's nested texture paths. It reads the Poly Haven `/files/<asset>` manifest and resolves the glTF dependency list to the exact URLs supplied for that asset. Production caching preserves the same relative dependency paths locally.

Useful source pages include:

- https://polyhaven.com/a/power_box_01
- https://polyhaven.com/a/utility_box_01
- https://polyhaven.com/a/modular_electric_cables
- https://polyhaven.com/a/industrial_caged_sconce
- https://polyhaven.com/a/industrial_wall_lamp
- https://polyhaven.com/a/security_camera_01
- https://polyhaven.com/a/fire_alarm
- https://polyhaven.com/a/barrel_03
- https://polyhaven.com/a/can_rusted
- https://polyhaven.com/a/pipe_wrench

Poly Haven license: https://polyhaven.com/license

## Recorded audio

Poly Haven is used for the visual environment; recorded audio comes from CC0 audio libraries and has procedural fallbacks.

### Kenney RPG Audio — CC0

Used for footsteps, creaks, and metal latch sounds.

- https://kenney.nl/assets/rpg-audio

### OpenGameArt — CC0 source files used by the development audio cache

- environmental ambience
- old elevator door
- whisper/voice event

The asset cache stores these locally for production when accessible.

## Creatures

The **Stalker** and **Crawler** are original runtime-built horror characters. They are not third-party character models. Each uses a named `THREE.Bone` hierarchy for pelvis, spine, chest, neck, head, jaw, shoulders, elbows, wrists, hips, knees, and ankles. Their meshes use authored procedural flesh/bruise materials, separate wet tissue, mouth, teeth, and eye materials, plus state-driven bone animation.

## Release packaging

Before commercial deployment, run:

```bash
npm run assets
```

This makes the release local-first. The live Poly Haven API remains a development/fallback path rather than something customers should need for normal play.
