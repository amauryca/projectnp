# Project North Pole

An atmospheric, browser-native 3D gate for a serious Christmas horror ARG. The first recovered artifact is a legacy Flash game wrapped in Ruffle. Five minutes of visible play triggers a brief signal failure and unlocks the first gate seal.

## Run locally

Serve this directory over HTTP (the Ruffle player and SWF need to load as web assets):

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

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
- Gate progress is saved in the browser's local storage for the current device.
- Puzzle seals 02–10 are presented as a lore interface scaffold and can be connected to the designed puzzle sequence as those records are authored.
