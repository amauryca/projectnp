# Project North Pole

An atmospheric, browser-native 3D gate for a serious Christmas horror ARG. The recovered Flash game is the prologue; after five minutes of visible play, a signal failure unlocks the first of ten connected puzzles.

## Run locally

Serve this directory over HTTP (the Ruffle player and SWF need to load as web assets):

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## The ten-stage route

The seals contain time reconciliation, a temporal shadow viewer, a 3D orientation puzzle, a phase-alignment signal, a USF coordinate fix, archive-version analysis, an inventory join, route reconstruction, dispatch-message ordering, and a final fragment reconstruction. Each correct solution releases a glyph used by the ending. Hints unlock one at a time and progress is saved in the browser.

Puzzle 02 currently uses a stylized in-site image timeline. Before a public run, verify which historical imagery dates are actually available at the chosen Google Earth pin and replace the prototype frame years in `puzzles.js` with those capture dates. Puzzle 05 points to the approximate USF Tampa campus address datum; the grid solve is entirely online.

## The recovered SWF

`assets/christmas-cat-17945-lore.swf` is the provided game with a harmless `DefineBinaryData` lore record added before its End tag. The interactive five-minute glitch is delivered by the website wrapper so it works with modern browsers and does not depend on patching compiled ActionScript internals.

To reproduce the patched asset from the original file:

```sh
python3 tools/patch_swf_lore.py christmas-cat-17945.swf lore-payload.json assets/christmas-cat-17945-lore.swf
```

The timer counts visible time while the recovered-media window is open, pauses when the browser tab is hidden, and can be dismissed. The experience is fictional; no campus visit is required.

## Notes

- The 3D gate is rendered locally with Canvas 2D projection and custom geometry; it has no 3D framework dependency.
- Ruffle is loaded from its official public CDN to run the Flash archive in current browsers.
- Puzzle answers are checked client-side using SHA-256 hashes; this is suitable for a prototype but does not prevent a determined player from inspecting the public source.
- Gate progress and hints are saved in the browser's local storage for the current device.
