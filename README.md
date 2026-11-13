# Apartment

A tiny life sim set inside a LiDAR scan of a real apartment. Tap things around the
place to tell the roommate what to do (wash dishes, vacuum, water plants, take out the
trash, make the bed, scrub the stove), and keep him rested and entertained or he goes
on strike.

Served at `/apartment` (see `basePath` in `next.config.ts`).

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:3000/apartment.

## How it is put together

- `app/game/engine.ts` — three.js scene, camera, chores, needs, mess and effects.
- `app/game/character.ts` — the roommate, built from primitives and animated in code.
- `app/game/nav.ts` + `nav.json` — walkable-floor grid baked from the scan, with A* pathfinding.
- `app/game/data.ts` — where things are in the apartment and what can be done there.
- `app/game/Hud.tsx` — the on-screen interface.
- `public/world/` — the cleaned scan (`apartment.glb`), floor fill and ground shadow.

## Rebuilding the world from a new scan

`scripts/build-world.cjs` turns a Scaniverse `.glb` export into the game assets. It
squares the scan up to the axes, removes the ceiling, a mirror "ghost room" and
floating fragments, lifts the roommate and his bedding out of the mesh, brightens the
dark hallway, and bakes the floor fill, shadow and walkable grid.

```bash
npm i --no-save sharp pngjs @gltf-transform/cli
node scripts/build-world.cjs scan.glb out
npx gltf-transform resize out/clean.glb out/r.glb --width 4096 --height 4096
npx gltf-transform webp out/r.glb out/w.glb --quality 80
npx gltf-transform meshopt out/w.glb public/world/apartment.glb --level medium
cp out/floor.png out/shadow.png public/world/ && cp out/nav.json app/game/nav.json
```

The crop boxes and station positions are specific to this scan; a new scan needs the
coordinates in the script and in `app/game/data.ts` updated.
