# Project North Pole

An atmospheric, browser-native 3D gate for a serious Christmas horror ARG. Players must complete Survey 00 by recovering the hand lamp, using its beam to reveal a missing gate tooth, and returning the tooth to activate the ten-seal register. The recovered Flash game is then available from the archive terminal.

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

`assets/christmas-cat-17945-lore.swf` is the provided game with a harmless `DefineBinaryData` lore record added before its End tag. The file embeds a compact Survey 00 lore record. The gate survey and register activation are implemented by the website so they work in modern browsers without changing the game’s compiled ActionScript.

To reproduce the patched asset from the original file:

```sh
python3 tools/patch_swf_lore.py /path/to/christmas-cat-17945.swf lore-payload.json assets/christmas-cat-17945-lore.swf
```

An optional “play it” audio cue starts after the page has been away for 30 seconds. It grows louder and more distorted over continued absence. Browsers may require an initial interaction with the page before they allow audio playback. The experience is fictional; no campus visit is required.

## Notes

- The 3D gate is rendered locally with Three.js. Gate doors animate open as seals are solved; Survey 00 includes a recoverable lamp and a beam-revealed gate tooth.
- Ruffle is loaded from its official public CDN to run the Flash archive in current browsers.
- Puzzle answers are checked client-side using SHA-256 hashes; this is suitable for a prototype but does not prevent a determined player from inspecting the public source.
- Gate progress and hints are saved in the browser's local storage for the current device.
