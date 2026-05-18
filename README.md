# deepstre.am

A living digital ecosystem for ecological observation, conservation research, and phenomenological inquiry — combining aerial imagery, ASCII rendering, point cloud audio, and interactive project frames. Built with Vite + React and deployed to [deepstre.am](https://deepstre.am).

## Architecture

The site is a single-page React application with three main subsystems:

### Pond (`src/pond/`)

The landing page at `/` renders a procedurally-generated, zoomable ASCII field derived from aerial photography. Project creatures live as glyphs within the field and can be clicked to open linked content.

- **`Pond.jsx`** — root component; loads a random pond from `/ponds-manifest.json` (with `/pond.json` fallback), initialises camera/creatures/field
- **`AsciiField.jsx`** — canvas renderer; decodes per-cell brightness/edge/region data into ASCII glyphs, applies shimmer and FX water-displacement noise, renders project glyphs (SVG above zoom 0.8, hex-cluster below), and runs phased hover-unfurl animations with pre-rasterized morphological dilation masks for clearance halos
- **`useCamera.js`** — smooth pan/zoom easing; suppresses panning during creature drags
- **`usePondField.js`** — fetches and decodes pond JSON; module-level cache prevents re-fetching across lifecycle
- **`usePondStore.js`** (Zustand) — camera state, viewport, mouse, focused/active project, FX toggle; derives `zone()` (aerial / surface / immersed by zoom) and `revealFactor()` (smoothstepped 0–1 for transitions)
- **`glyphs.js`**, **`shimmer.js`**, **`displacement.js`** — glyph selection, brightness modulation, doublet displacement

Pond data is a JSON blob with grid dimensions, base64-encoded per-cell arrays (brightness, edgeMag, edgeAngle, region), color ramps, and creature home coordinates. `src/utils/pondCodec.js` decodes and interpolates them.

### MURMUR (`src/murmur/`)

An interactive point cloud audio-visual instrument at `/murmur`. LiDAR scans are loaded as PLY files, decimated to a target point count, and rendered as a GPGPU particle system. Audio and camera position drive the cloud's behaviour — both visually and sonically — in real time.

**Two modes:**

- **Reactive** — audio drives the cloud's visual energy. Per-frame FFT analysis produces four smoothed bands (bass, lowMid, highMid, treble), each mappable to one of four particle effects: explode, dissolve, magnify, or chop. Each effect targets a 16-bit bitmask of spatial groups. Idle breathing uses a 0.2 Hz sine on the bass channel when no audio is playing.
- **Sculpt** — camera orbital position controls a granular synthesiser. Azimuth scrubs the buffer position (one full orbit = full file), elevation sets playback rate (−90° = 0.6×, +90° = 1.6×), camera distance sets grain size (near = 0.02 s granular texture, far = 0.25 s long phrases), orbital speed modulates grain overlap density (fast orbit = sparse, still = dense). SPACE freezes the buffer read position while grain parameters continue updating.

**Mode-switch choreography** (`Murmur.jsx`):
- 0 ms: edge-darkening vignette fades in (CSS animation)
- 80 ms: audio fade-out begins over 200 ms
- 160 ms: signal chains swap at fade midpoint, fade-in begins
- 200 ms: camera lerps toward mode-default position
- 700 ms: vignette element removed

Session state (mode + sculpt params) is saved to `sessionStorage` on exit and restored on re-enter.

---

#### Audio engine (`audio/`)

**`AudioEngine.js`** — Tone.js singleton. Manages two parallel signal chains sharing a single FFT analyser → destination:
- **Reactive chain**: `Tone.Player` for standard playback with loop and seek
- **Sculpt chain**: `Tone.GrainPlayer` with per-frame `loopStart`/`loopEnd` window updates
- **Chord layer**: up to N `Tone.GrainPlayer` voices tuned by semitone intervals, routed through a shared gain → `Tone.Filter` → analyser. Chord voices fade out gracefully (40 ms gain ramp) when released.
- BPM detection runs deferred after buffer load (does not block playback startup).
- `fadeOut` / `fadeIn` ramp the master destination volume for clean chain swaps.

**`ReactiveAnalyzer.jsx`** (`useReactiveDriver`) — runs in `useFrame` every tick. Reads FFT, computes band energies, applies sensitivity multiplier, and writes `effectParamsRef.current` for the GPGPU shaders. Also writes `uBassEnergy`, `uMidEnergy`, `uTrebleEnergy` uniforms for fragment-shader color tinting.

**`GranularSculptor.jsx`** (`useSculptDriver`) — runs in `useFrame` every tick. Converts spherical camera coordinates to grain parameters, applies them to the `GrainPlayer`, and writes sculpt shader uniforms. Also computes **color-affinity resonance**: the current playback rate is converted to a pitch class; each of the 16 spatial groups has an assigned pitch class (derived from its dominant color hue), and proximity of the current pitch to each group's pitch produces a `sculptResonance[16]` float array that drives per-group visual impulse in the GPGPU shaders.

**`chordVoicings.js`** — voicing presets: Thirds, Open, Quartal, Unison (micro-detuned), Custom. Exports `resolveIntervals(chordConfig)` used by the chord trigger.

**`detectBPM.js`** — lightweight onset detection for BPM readout in the transport bar.

---

#### GPGPU particle system (`scene/gpgpu/`)

`ParticleSystem.js` uses `GPUComputationRenderer` with four ping-pong textures:

| Texture | Content |
|---|---|
| `position` | Current XYZ per particle |
| `velocity` | Current velocity per particle |
| `home` | Rest position (written once at load) |
| `state` | Per-particle scalar state (chop phase, dissolve alpha, magnify scale) |

Each compute pass runs a GLSL fragment shader that reads the previous frame's textures and writes the next. The four effect channels (explode, dissolve, magnify, chop) are encoded as bit-packed group masks — each particle knows its group index and tests `(groupMask >> groupIdx) & 1`. In sculpt mode the `sculptResonance[16]` array drives per-group attraction impulses toward group centers.

**Group physics (`scene/groupPhysics.js`)** — CPU spring-damper simulation that mirrors the GPGPU velocity shader exactly. Both `SculptOverlay` and `CheeseStrings` read from the shared `groupState` buffers. Frame-time deduplication prevents double-advance when multiple scene components call `updateGroupPhysics` in the same frame.

---

#### Scene components (`scene/`)

- **`PointCloudScene.jsx`** — R3F `<Canvas>` with `fog`, `ambientLight`, GPGPU fallback flag, and all scene children. Mobile detection gates antialiasing and DPR.
- **`PointCloud.jsx`** — `BufferGeometry` + `ShaderMaterial`; swaps cloud data via `useMemo` without unmounting. Consumes `effectParamsRef` and `chordParamsRef` via refs (no re-renders).
- **`CameraRig.jsx`** — wraps `OrbitControls`; tracks camera velocity each frame and writes `cameraState` to the store at ~10 fps. Lerps toward `cameraTarget` when set.
- **`SculptOverlay.jsx`** — 16 edge-wireframe boxes arranged on the 4×4 spatial grid. In sculpt mode with grid on, each box's opacity is driven by its `sculptResonance` value. In reactive mode boxes stay at dim rest opacity.
- **`CheeseStrings.jsx`** — elastic line segments drawn between all 24 shared-edge adjacent pairs in the 4×4 group grid. Each midpoint wobbles with a frequency and amplitude proportional to the smoothed XZ displacement of its two endpoint groups. Strings fade in when groups are displaced, fade out when the cloud is at rest.
- **`OrbitIndicator.jsx`** — Fresnel rim-glow sphere (additive blending) that appears when the camera is orbiting. Rim opacity scales with orbital speed; combined with DitherBleed's ink-bleed it halos into a soft atmospheric smear.
- **`ChordController.jsx`** — pointer event handler (no render output). Long-press (80 ms) on the canvas sphere triggers a chord; the tapped world point determines the root group via `groupFromWorldPoint`, and the group's color-affinity pitch class seeds the root semitone. Drag while held sweeps filter cutoff (X axis, logarithmic 200–12 kHz) and resonance Q (Y axis, 0.5–8). Multi-touch cancels chord and lets orbit/pinch through. `ChordRing` renders a Fresnel rim sphere at the tap point while the chord is active.
- **`AudioAtmos.jsx`** — ambient atmosphere audio node.
- **`OrbitLights.jsx`** — dynamic lights that orbit the cloud.
- **`DitherBleed.jsx`** — full-screen post-process via `EffectComposer` + `ShaderPass`:
  - **Ink bleed**: 5×5 luminance-weighted neighbourhood diffusion softens point edges into an ink-wash texture.
  - **Bayer ordered dithering**: 4×4 threshold matrix applied strongest on bright pixels, adds organic grain.
  - **Grain echo** (sculpt only): directional screen-space smear in the direction of the current grain azimuth (positionFraction → angle), plus additive ghost of a nearby sample. Intensity driven by normalized grain size and orbital speed.
  - **Sparkle**: stochastic per-pixel flicker at 14 fps on cloud pixels in dark surrounding areas, gated by echo strength.
  - **Edge vignette**: radial darkening of screen corners, center unaffected.

---

#### UI components (`ui/`)

- **`MediaBar.jsx`** — unified bottom bar. Expands to reveal: sensitivity slider (global band-energy multiplier, persisted), POND album track list (6 tracks, prefetched on mount, one selected at random and loaded automatically), cloud library (bundled + user-uploaded), audio drag-drop zone, PLY drag-drop zone. Collapsed bar shows transport controls (play/pause, scrub, time, loop, BPM) in reactive mode, or the track name in sculpt mode. Audio context is started on first pointer interaction, which also auto-switches to sculpt mode.
- **`SculptHUD.jsx`** — canvas-rendered waveform display in sculpt mode. Five scrolling rows (POS, GRN, RATE, LAP, SPD) show the last 90 samples of grain parameters. A lit-dots row at the bottom shows how many of the 16 groups are resonating above threshold. All lines turn purple when grain is frozen.
- **`MappingsPanel.jsx`** — collapsible left-side panel (reactive mode only). Each of the four effects (EXPLODE, DISSOLVE, MAGNIFY, CHOP) has: band selector, strength slider, and a 4×4 group-bitmask toggle grid. Settings persist to `localStorage`.
- **`ModeToggle.jsx`** — two-button toggle (top-center) to switch between reactive and sculpt.
- **`KeyboardHelper.jsx`** — hints bar that fades after 5 s; `?` opens a full help overlay with a two-column table (reactive / sculpt) for all shortcuts. Shortcuts: SPACE (play/pause or freeze), M (mode), G (group grid), R (reset camera), ESC (close/pond).

---

#### Cloud system (`clouds/`)

- **`_manifest.js`** — bundled PLY registry with `id`, `name`, `file` path, `meta` JSON path, `targetPoints`.
- **`loaders.js`** — `loadPLY` / `loadPLYFromFile` (binary + ASCII PLY), `decimate` (stratified 16³-grid sampling to target point count), `normalize` (center + scale to −1…+1 bounding cube), `computeGroupAffinities` (assigns each of the 16 spatial groups a dominant pitch class from the average color hue of its points, plus an affinity strength from point density).
- User-uploaded PLY files are capped at 2 M points before decimation to 300 K; a notice is shown if decimation occurs. Up to the last two user clouds are kept in session.

**Chord voicing config** and **effect mappings** persist to `localStorage`. Mode + sculpt params persist to `sessionStorage` across pond ↔ murmur navigation.

Routes: `/murmur` (instrument), `/murmur/about` (mode guides and cloud registry).

### Projects (`src/projects/`)

Eight project entries define creatures in the pond. Each exports an object:

```js
{
  slug, name, description, status,          // identity
  home: { x, y },                           // normalised pond position (0–1)
  glyph: { ascii, svg, svgUrl },            // ASCII char + optional SVG icon
  behavior: { bobAmplitude, bobPeriod, cursorAgitation },
  frame: { mode, target },                  // 'iframe' | 'route' | 'drawer'
  link: { about, ... },                     // optional extra links
}
```

`src/projects/_manifest.js` imports and re-exports the full list. `src/frames/` dispatches to `IframeModal`, `RoutedFrame`, or `DrawerFrame` based on `frame.mode`.

### Routing (`App.jsx`)

| Path | Component |
|---|---|
| `/` | Pond |
| `/murmur` | Murmur instrument |
| `/murmur/about` | MurmurInfoPage |
| `/thesis` | ThesisPage |
| `/deepstream-info` | DeepstreamInfoPage |
| `*` | NotFoundPage |

React Router 7; all routes fall back to `index.html` via Vercel SPA rewrite.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
```

Scroll to zoom, drag to pan. Click a creature to open its project frame. Press ESC to close.

Enable the `fx` debug overlay (bottom-right controls) to see displacement vectors around each creature.

## Baking the pond

The ASCII field is generated from an aerial photograph via a 5-pass pipeline:

1. Drop a source image at `public/aerial/pond-source.jpg`
2. Open the browser bake tool at `tools/bake-aerial/index.html` — adjust the knobs until the ASCII preview looks right, then click **Export pond.json** and **Export bake.config.json**, saving both to the repo root
3. Run the CLI bake to confirm reproducibility and generate the final `public/pond.json`:

```bash
npm run bake
```

The CLI re-runs the same pipeline headlessly using `sharp` and writes `public/pond.json`. If the visual result diverges from the browser preview, adjust `bake.config.json` and repeat.

Multiple ponds are supported: `public/ponds-manifest.json` lists available pond files. On load, one is selected at random using a Fisher-Yates shuffle; the result is cached at module level to prevent re-fetching.

## Build

The build runs a preflight check before compiling:

```bash
npm run build      # preflight → vite build → dist/
npm run preview    # serve dist/ locally
```

The preflight (`scripts/preflight.mjs`) confirms:
- `public/pond.json` exists, is valid JSON, and has a `version` field with grid dimensions
- The project manifest lists at least one project
- Every project's `frame.target` is an `https://` URL or a `/` route

## Deploy

The project is configured for Vercel (`vercel.json`):
- SPA rewrite: all routes → `index.html`
- `/pond.json` is cached for 1 hour (so re-bakes propagate quickly)
- `/assets/*` are immutably cached (hashed filenames)

Deploy manually:

```bash
vercel --prod
```

Or connect the repo to Vercel for automatic deploys on push to `main`. Vercel will pick up `vercel.json` and run `npm run build` automatically.

## Deep links

Share a direct link to any project frame:

```
https://deepstre.am/?project=g2tree
https://deepstre.am/?project=murmur
```

The `?project=<slug>` parameter opens the project's frame on load.

## Projects

| Slug | Frame mode | Description |
|---|---|---|
| g2tree | iframe | Aerial LiDAR to tree canopy analysis |
| beechlens | iframe | Beech bark disease image classifier |
| grovematrix | iframe | Forest composition matrix viewer |
| streamwise | iframe | Watershed delineation tool |
| flo | iframe | Flow accumulation modelling |
| deepstream | route (`/deepstream-info`) | Deepstream project overview |
| thesis | route (`/thesis`) | Thesis documentation |
| murmur | route (`/murmur`) | Point cloud audio instrument |

## Stack

| Layer | Library |
|---|---|
| Build | Vite 6 |
| UI | React 18, React Router 7 |
| State | Zustand 5 |
| 3D / WebGL | Three.js, React Three Fiber 8, Drei |
| Audio | Tone.js 15 |
| Image processing | Sharp (bake pipeline only) |
| Styles | Plain CSS, CSS custom properties — no framework |
| Deploy | Vercel |
