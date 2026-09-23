# Diab1 — Tristram VR

A first-person WebXR environment remake of the original Diablo town for Meta Quest 3. This first build focuses on the town and its surroundings: no NPCs, combat, quests, dungeon levels or furnished interiors.

## Explore

Open the hosted HTTPS page in **Meta Quest Browser**, then select **Enter VR**.

- Left stick: smooth, head-relative walking. Click it to move faster.
- Right stick: smooth turning around the headset.
- A: return to the town square.
- Desktop: WASD, drag to look, Shift to move faster; arrow keys also move/turn.
- Phone: left thumb pad to walk, drag elsewhere to look.
- Map and settings are available before entering VR / in screen mode.

## Environment

The Rising Sun tavern, Griswold's open forge, Pepin's house, surrounding cottages, cathedral with its offset bell tower and lower aisles, cemetery, Adria's hut, bridges, recessed streams, dirt paths, stone walls, dead trees and the rocky western boundary.

Shingles, timber framing, doors, windows, stone trim, gravestones, well, carts and forge props are three-dimensional geometry. Materials are generated locally at startup; no model or texture downloads are required. Three.js 0.180.0 is included in the published game bundle.

The supplied isometric town screenshot drives the plan in src/layout.js. Its projection is reversed to place landmarks and trace paths/streams. A 160 × 160 metre world is an **estimated VR scale**, not a canonical measurement. The building elevations, unseen backs, construction details and bridge clearances are interpretations of the original sprites. This is a reference-based first pass, not an exact asset reconstruction.

## Run locally

    npm ci
    npm start

Visit http://localhost:4173. For a headset, use HTTPS hosting; a plain HTTP LAN address cannot start immersive WebXR.

    npm run build

Every push to main builds the game with Vite and publishes the production bundle to GitHub Pages, using the same deployment setup as Oasis and Waterworld. No test jobs run during publishing. The repository's **Settings → Pages → Source** must be **GitHub Actions**.

## Rendering

Geometry is merged by material and 24 m spatial cells for frustum culling. The balanced preset uses textured PBR materials, baked contact shading, two nearby dynamic lights, cheap procedural water normals and no shadow-map pass. High detail enables a static 2048 px shadow map. VR uses a 1.0 framebuffer scale and fixed foveation; a 90 Hz session is requested when supported. These are settings, not a measured headset frame-rate guarantee.

Add ?review=1 for a developer view selector, movement test and collision checks. This panel is hidden during normal use.

## Layout references

- The user's supplied 1536 × 768 original-town overview.
- [Diablo I Tristram overview](https://www.purediablo.com/d2wiki/D1_Tristram).
- [Original Tristram map record](https://www.purediablo.com/d2wiki/File%3AOriginal-Tristram.png).
- [VGMaps PC atlas](https://vgmaps.com/Atlas/PC/index.htm), Diablo / Tristram, map by Revned.

All geometry and texture generation in this repository is original implementation. Diablo, Tristram and their associated designs belong to Blizzard Entertainment. Unofficial fan environment study.
