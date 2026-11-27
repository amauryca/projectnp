# Project North Pole

A full-screen, browser-native 3D gate chamber for a serious Christmas horror ARG. Players investigate ten gates in order. Each gate has one active evidence object; inspecting it opens that stage's evidence puzzle. Solving it animates the gate and advances the camera.

## Run locally

Serve this directory over HTTP so the Three.js module, Ruffle player, and game asset load as web resources:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## The ordered route

1. Survey 00: recover the hand lamp, crouch at the rug, lift its edge, and find the small brass key underneath. This is required to activate the register.
2. Exposure Order: arrange five photograph records by their embedded capture times. The frame letters reveal the cryptex word.
3. The Cryptex: rotate five 3D rings to enter that word.
4. The Blind Side: compare the mirror with the real USF Tampa campus view in Google Earth and match the camera heading.
5. Signal 05: decode a visual Morse transmission. This is the only Morse puzzle.
6. Negative Archive: sort six recovered image records by DateTimeOriginal and read the final character of each metadata description.
7. The Last Exposure: estimate the photograph time from the camera clock. The accepted window is 1:57–2:03 AM.
8. The Torn Portrait: rebuild a nine-piece photograph and read the frame.
9. Behind the Glass: turn the mirror to reveal the hidden UUencoded record.
10. The Winter Record: decode the message and enter its instruction, then watch the 30-second escape ending.

The soundtrack is instrumental and contains no speech. Music begins after a browser interaction and can be toggled in the HUD. No campus visit is required. Stage 04 links to a public Google Earth view of the USF Tampa campus; the in-game camera-heading plates are original diagrams, not Google imagery. Field notes support typing and drawing and stay in the current browser. The ending stops controls for the player who completes the game; it does not pause other visitors or shut down the shared website.

For testing, hold **C + M + E** together to skip the current stage. Skipping the opening stage also grants the lamp and brass key needed to continue.

## The recovered SWF

`assets/christmas-cat-17945-lore.swf` is the provided game with a Survey 00 lore record embedded as a `DefineBinaryData` tag. To rebuild it from the original asset:

```sh
python3 tools/patch_swf_lore.py /path/to/christmas-cat-17945.swf lore-payload.json assets/christmas-cat-17945-lore.swf
```

## Notes

- The room is built with Three.js. Evidence hotspots only open the next unsolved gate, so players cannot skip ahead or reopen later seals out of order.
- Google Earth and the USF history page are used as online references; clues do not require entering campus.
- Puzzle answers and progress are handled client-side. Progress is saved in the browser's local storage.
- The game has no cross-player score service yet. A shared live leaderboard and an Instagram stream overlay need a server-side score store and a separate streaming setup.

