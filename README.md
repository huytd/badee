# Badee

A simple, browser-based 3D modelling and animation tool for people who have never used 3D software.
Add basic shapes, move, turn and resize them, then animate them with keyframes. Onion skinning shows
ghosts of the frames before and after, so you can see the motion as you pose it.

> Status: early prototype.

## Features

- **Shapes:** cube, ball, cylinder, cone, pyramid and ring, added with one tap
- **Editing:** Move, Turn and Resize with on-screen handles, optional snapping, eight colours, duplicate and delete
- **Keyframe animation:** with **Record** on, every change saves a keyframe at the current frame. You can also add or remove keys by hand and drag them along the timeline.
- **Onion skin:** red ghosts for earlier frames and green for later ones, with adjustable count, gap and strength, plus an optional motion path
- **Playback:** 12–96 frames at 6–24 fps, smooth or steady motion between keys, and looping
- **Undo/redo**, with an autosave to the browser's local storage
- **Touch support:** works with mouse or touch, and is tested for iPad Safari: one finger orbits, pinch zooms, two fingers pan
- **Themes:** light and dark, following the system setting

## Run it

There is no build step. Open `index.html` in a browser, or serve the folder:

```sh
npx serve .
# or
python3 -m http.server 8000
```

To try it on an iPad, serve it on your local network and open `http://<your-computer-ip>:8000` in Safari.
You can also host it on GitHub Pages: open **Settings → Pages** and deploy from the `main` branch.

## Shortcuts

| Key | Action |
| --- | --- |
| `M` / `T` / `S` | Move / Turn / Resize |
| `Space` | Play / pause |
| `←` / `→` | Previous / next frame |
| `K` | Add or remove a keyframe |
| `O` | Toggle onion skin |
| `Delete` | Delete the selected shape |
| `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` | Undo / redo |
| `Ctrl/Cmd+D` | Duplicate |

## How it works

- [three.js](https://threejs.org/) r128 is loaded from a CDN, along with its `OrbitControls` and `TransformControls`.
- Each shape stores its keyframes as a map of `frame → { position, quaternion, scale }`.
  Frames between keys are interpolated: position and scale linearly (or with smoothstep easing), rotation with quaternion slerp.
- Onion-skin ghosts are translucent copies that share the shape's geometry and are posed at nearby frames. They are rebuilt whenever the frame or the keys change, and hidden during playback.
- Undo/redo keeps up to 80 JSON snapshots of the scene.

## Project layout

```
index.html   page markup
style.css    styles and light/dark themes
app.js       scene, editing, timeline and onion-skin logic
```

## Ideas for next steps

- Exact-value fields for position, rotation and size, as an optional panel
- Grouping shapes and parent/child links
- Camera keyframes
- Exporting to video or GIF, and saving or loading scene files
