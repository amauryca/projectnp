# Project North Pole

A full-screen, browser-native 3D gate chamber for a serious Christmas horror ARG. Players investigate ten gates in order. Each gate has one active evidence object; inspecting it opens that stage's evidence puzzle. Solving it animates the gate and advances the camera.

## Run locally

Serve this directory over HTTP so the Three.js module, Ruffle player, and game asset load as web resources:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## The ordered route

1. Survey 00: recover the hand lamp, illuminate the first gate, and return its missing tooth. This is required to activate the register.
2. Exposure Order: arrange five photograph records by their embedded capture times. The frame letters reveal the cryptex word.
3. The Cryptex: rotate five 3D rings to enter that word.
4. The Blind Side: inspect the mirror plate and align its reflection.
5. Signal 05: decode a visual Morse transmission. This is the only Morse puzzle.
6. Image Residue: isolate an image channel to find its hidden word.
7. Ground Truth: use the photograph's USF Tampa coordinate and the public campus history record.
8. The Shadow Index: align a lamp shadow with an etched gate mark.
9. Route Memory: reconstruct the only valid route through the chamber.
10. Continuity: assemble the recovered fragments and complete the final record.

The soundtrack is instrumental and contains no speech. Music begins after a browser interaction and can be toggled in the HUD. No campus visit is required.

## The recovered SWF

`assets/christmas-cat-17945-lore.swf` is the provided game with a Survey 00 lore record embedded as a `DefineBinaryData` tag. To rebuild it from the original asset:

```sh
python3 tools/patch_swf_lore.py /path/to/christmas-cat-17945.swf lore-payload.json assets/christmas-cat-17945-lore.swf
```

## Notes

- The room is built with Three.js. Evidence hotspots only open the next unsolved gate, so players cannot skip ahead or reopen later seals out of order.
- Google Earth and the USF history page are used as online references; clues do not require entering campus.
- Puzzle answers and progress are handled client-side. Progress is saved in the browser's local storage.
