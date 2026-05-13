# MURMUR

A point cloud audio instrument. Three-dimensional LiDAR scans of real places, rendered as particle systems and driven by audio. Two modes: **reactive** (music drives the cloud's visual energy) and **sculpt** (camera orbital position controls a granular synthesiser scrubbing through the loaded audio).

Routes: `/murmur` · `/murmur/about`

---

## Architecture

```
Murmur.jsx ── orchestrates modes, transition choreography, top-level layout
│
├── scene/
│   ├── PointCloudScene.jsx   R3F Canvas; DPR/antialias mobile caps
│   ├── PointCloud.jsx        BufferGeometry + ShaderMaterial; exposes matRef to store
│   ├── CameraRig.jsx         OrbitControls + velocity tracking + camera lerp
│   └── pointShader.js        GLSL shaders + makeUniforms()
│
├── audio/
│   ├── AudioEngine.js        Tone.js singleton — Player, GrainPlayer, Analyser
│   ├── ReactiveAnalyzer.jsx  useFrame → FFT → shader uniforms; idle breathing
│   └── GranularSculptor.jsx  useFrame → camera spherical coords → grain params
│
├── ui/
│   ├── ModeToggle.jsx        Reactive / Sculpt toggle (requires audio loaded)
│   ├── Transport.jsx         Play/pause + scrub (reactive mode only)
│   ├── AudioUpload.jsx       Drag-drop, wave loading animation, 5s error dismiss
│   ├── SculptHUD.jsx         Live grain parameter readout; frozen indicator
│   ├── CloudPicker.jsx       Library browser + PLY upload with metadata form
│   └── KeyboardHelper.jsx    Global keyboard handler + fade hint bar + help overlay
│
├── store/
│   └── useMurmurStore.js     Zustand — single source of truth for all state
│
└── clouds/
    ├── _manifest.js          Registry of bundled PLY clouds
    └── loaders.js            loadPLY, loadPLYFromFile, decimate, normalize, checkFileFormat
```

### Data flow

1. On mount, `loadCloud('default-grove')` fetches the PLY file and meta.json, decimates to `targetPoints` (60k on mobile, manifest value on desktop), normalises positions to −1…+1, and writes `cloud` to the store.
2. `PointCloud` reads `cloud.positions` / `cloud.colors` and builds a `BufferGeometry`. Its `ShaderMaterial` ref is exposed to the store via `setUniformsRef`.
3. **Reactive mode:** `ReactiveAnalyzer` calls `audioEngine.getFFT()` every frame and writes band energies directly to shader uniforms. When nothing is playing, a 0.2 Hz sine wave on `uBassEnergy` keeps the cloud breathing.
4. **Sculpt mode:** `GranularSculptor` converts camera spherical coordinates to grain parameters and calls `audioEngine.setGrainParams()` every frame.
5. Mode transitions are orchestrated in `Murmur.jsx`: edge vignette at 0ms → audio fadeOut at 80ms → chain swap at 160ms → camera lerp at 200ms → vignette clear at 700ms.

---

## File map

| File | Purpose |
|---|---|
| `Murmur.jsx` | Root layout, mode-switch choreography, tab visibility, keyboard helper |
| `scene/PointCloudScene.jsx` | R3F Canvas with DPR/antialias caps for mobile |
| `scene/PointCloud.jsx` | Geometry + shader material; ticks `uTime`; exposes `uniformsRef` to store |
| `scene/CameraRig.jsx` | OrbitControls, per-frame velocity/speed, lerp toward mode-default position |
| `scene/pointShader.js` | Vertex: treble jitter, size by bass+attenuation. Fragment: soft circle, tint, energy brighten |
| `audio/AudioEngine.js` | Singleton. Player, GrainPlayer, Analyser, reactive/sculpt chains, FFT, fades |
| `audio/ReactiveAnalyzer.jsx` | useFrame hook → FFT bands → shader uniforms; idle sine breath when not playing |
| `audio/GranularSculptor.jsx` | useFrame hook → spherical coords → setGrainParams; grain freeze via `store.grainFrozen` |
| `ui/ModeToggle.jsx` | Two-button toggle; disabled when no audio loaded |
| `ui/Transport.jsx` | RAF-driven scrub (uncontrolled input), 1 Hz display update, no 60fps React re-renders |
| `ui/AudioUpload.jsx` | Drag-drop, ▁▂▃▄▅▆▇█ wave animation while decoding, 5s error auto-dismiss |
| `ui/SculptHUD.jsx` | Polls `store.sculptParams` at 80ms; shows grain-frozen state |
| `ui/CloudPicker.jsx` | Library tab (manifest + session clouds) + Upload tab (PLY preview + optional metadata) |
| `ui/KeyboardHelper.jsx` | Keyboard shortcuts, 5s fade hint bar, `?` help overlay |
| `store/useMurmurStore.js` | Mode, cloud, audio, camera state, sculpt params, grain freeze, info panel open |
| `clouds/_manifest.js` | Bundled cloud registry: id, file, meta URL, targetPoints |
| `clouds/loaders.js` | loadPLY (URL), loadPLYFromFile (File → object URL), decimate (16³ grid stratified), normalize (−1…+1), checkFileFormat |

---

## Adding a new default cloud

**1. Export the scan** from Polycam, CloudCompare, or similar. Both ASCII and binary PLY work. Coloured point clouds (`vertex { color uchar x3 }`) will render with point colours; greyscale defaults to the shader tint palette.

**2. Drop the files into `public/clouds/`:**
```
public/clouds/south-meadow.ply
public/clouds/south-meadow.meta.json
```

**3. Write the meta.json** — think wall label, not spreadsheet:
```json
{
  "name": "South Meadow",
  "place": "Ann Arbor, MI",
  "captured": "2026-05-01",
  "captured_with": "iPhone 15 Pro / Polycam",
  "description": "The edge of the property where the grass gives way to scrub. Captured just after rain; the ground return is unusually dense.",
  "audio_suggestion": "Field recordings work best here. The scan responds to mid frequencies, where footsteps and wind live."
}
```

**4. Add an entry to `src/murmur/clouds/_manifest.js`:**
```js
{
  id:           'south-meadow',
  name:         'South Meadow',
  file:         '/clouds/south-meadow.ply',
  meta:         '/clouds/south-meadow.meta.json',
  targetPoints: 120_000,
}
```

The cloud appears in the CloudPicker library tab automatically. No other code changes needed.

**5. Update `src/pages/MurmurInfoPage.jsx`** — add the cloud to the `BUNDLED_CLOUDS` array at the top of the file so the `/murmur/about` page lists it with its description.

**Point count guidance:**
- 80k–150k: crisp, fast load, works on all devices
- 300k+: richer density, may lag on mobile (the mobile cap handles this at load)
- Raw scan > 2M points: the upload flow auto-decimates to 300k and shows a notice

---

## Camera-to-grain mapping

This table is the instrument design. Retune it by editing `MAPPING` in `audio/GranularSculptor.jsx`.

| Camera motion | Spherical variable | Grain parameter | Range | Perceptual effect |
|---|---|---|---|---|
| **Orbit** (horizontal drag) | Azimuth −π … +π | Buffer position | 0 – 100% of file | Scrubs through the source audio; a full orbit plays the whole file |
| **Tilt** (vertical drag) | Elevation −π/2 … +π/2 | Playback rate | 0.6× – 1.6× | Camera low (looking at ground) = slowed, thickened; high (looking up) = pitched up, stretched |
| **Dolly** (scroll / pinch) | Radial distance 0.5 – 3.0 | Grain size | 20ms – 250ms | Close = microscopic texture; far = long phrases blurring into drones |
| **Orbit speed** | Smoothed frame-delta magnitude | Overlap density | 0.15 – 0.60 | Still = dense, lush overlap; fast sweep = sparse, stuttery fragmentation |
| **Rate deviation** | \|playbackRate − 1.0\| | Detune | ±200 cents | Keeps pitch shifts organic — subtle colour even at neutral rate |

**Grain freeze (SPACE in sculpt mode):** locks `loopStart`/`loopEnd` while all other parameters still respond to camera movement. Useful for finding a section of the recording you want to explore spatially — park the buffer position, then orbit freely.

---

## Known issues / TODOs

- **LAS/LAZ import** — `checkFileFormat` returns an unsupported message; actual decode not implemented. Needs a WASM-based reader (e.g., `laz-perf`).
- **XYZ/PTS import** — same. Could parse trivially (whitespace-delimited x y z r g b) but not yet done.
- **Mobile performance** — 60k point cap helps but complex clouds can still stutter on older phones. A WebGL-instanced approach or LOD switching would help.
- **Audio buffer duplication** — `GrainPlayer` and `Player` each hold the decoded buffer. The buffer is shared as a `ToneAudioBuffer` reference, but both players keep their own internal copy in some Tone.js versions.
- **No cloud persistence** — user-uploaded clouds exist only for the session. IndexedDB would fix this; URL-based sharing is impractical beyond ~100k points.
- **No audio persistence** — same. Refresh loses the loaded buffer.
- **GrainPlayer edge case** — if `grainSize` is large and the camera is near the end of the buffer, `loopEnd` can exceed `duration`. Clamped in `setGrainParams` but not exhaustively tested.
- **Camera reset in sculpt** — pressing R snaps to the reactive default `[2, 1.5, 2.5]` regardless of current mode. Should snap to mode-appropriate default.
- **SEO** — og:image references `/og-murmur.png` (placeholder). Swap in a real screenshot once the default cloud is settled. True dynamic OG tags require react-helmet or SSR.
- **CloudPicker info card** — when switching clouds via the picker, the info card content updates but the card doesn't re-open if it was closed.
- **`MurmurInfoPage.jsx` cloud list** — currently hard-coded. Should be driven from the manifest + fetched meta.jsons so it stays in sync automatically.
