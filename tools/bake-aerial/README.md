# bake-aerial

Browser tool that converts an aerial photograph into `pond.json` — the baked data file consumed by the deepstre.am pond renderer.

## Running

Open `index.html` directly in any modern browser, or serve the folder to avoid file:// CORS restrictions:

```bash
npx serve tools/bake-aerial
# → http://localhost:3000
```

## Workflow

1. **Load** an aerial image (JPEG, PNG, WEBP, etc.) with the file input
2. **Tune** the sidebar knobs — four previews and the ASCII render update live
3. **Export** when satisfied:
   - `pond.json` → copy to `public/pond.json`
   - `bake.config.json` → copy to repo root (drives the future Node CLI)
   - `preview.txt` → optional ASCII reference

## Knobs

### Grid

| knob | default | meaning |
|---|---|---|
| cols | 320 | horizontal cell count (4-step) |
| rows | 160 | vertical cell count (2-step) |

Higher resolution → slower bake, larger pond.json. 320×160 (~51 k cells) is the recommended starting point.

### Tone

| knob | default | meaning |
|---|---|---|
| clip lo | 2% | bottom percentile crushed to black before stretch |
| clip hi | 98% | top percentile blown to white before stretch |
| gamma | 0.85 | power curve after stretch — below 1 lifts midtones, above 1 sinks them |
| invert | off | flip brightness; useful for near-infrared or negative sources |

### Edges

| knob | default | meaning |
|---|---|---|
| threshold | 0.15 | **preview-only.** Controls which cells render as edge characters in the ASCII view. The full `edge_mag` channel is baked; the runtime picks its own threshold. |

### Regions

| knob | default | meaning |
|---|---|---|
| water sat | 0.25 | saturation ceiling — cells below this can be water |
| water hue lo | 160° | lower hue bound for water detection (blue-green) |
| water hue hi | 260° | upper hue bound for water detection (blue-violet) |
| veg bias | 0.08 | green-channel excess `g − (r+b)/2` above which a cell is vegetation |
| out lum | 0.05 | raw luminance below which a cell is outside the pond boundary |

Tune `out lum` first to mask the photo border, then `veg bias` to separate trees from open ground, then the water knobs.

## Previews

| panel | what it shows |
|---|---|
| source | image resampled to cols×rows (before any tone mapping) |
| brightness | tone-mapped luminance as greyscale |
| edge mag | Sobel gradient magnitude as greyscale |
| regions | false-colour: water=blue, shore=amber, vegetation=green, outside=dark grey |

## Pipeline (bake.js)

1. **Resize** — `drawImage` onto `OffscreenCanvas` at cols×rows, `imageSmoothingQuality: 'high'`
2. **Tone** — per-cell luminance `0.299r + 0.587g + 0.114b`, HSL, green bias; percentile clip + linear stretch + gamma
3. **Sobel** — 3×3 kernel on brightness; full magnitude (0–1) and angle (−π..π) stored
4. **Regions** — priority order: `outside → vegetation → water → shore`
5. **Quantize** — Float32 → Uint8; `edgeAngle` mapped as `(a+π)/(2π)×255`; channels base64-encoded

## bake.js module API

```js
import {
  RAMPS,         // glyph ramp constants (also shipped inside pond.json)
  DEFAULT_CFG,   // default knob values
  resampleToGrid,  // (imageBitmap|ImageData, cols, rows) → ImageData
  computeChannels, // (imageData, cfg) → { brightness, edgeMag, edgeAngle, region }
  pickGlyph,       // (b, em, ea, reg, cfg) → string
  packPondJSON,    // ({ channels, cfg, meta }) → object
} from './bake.js'
```

`bake.js` has no hard browser dependency except `OffscreenCanvas` inside `resampleToGrid`. For the Node CLI, set `globalThis.createCanvas` to a canvas factory (e.g. from `@napi-rs/canvas`) before calling `resampleToGrid`.

## pond.json schema

```jsonc
{
  "version": "1.0",
  "source": "pond-source.jpg",
  "baked_at": "2026-05-12T10:00:00.000Z",
  "grid": { "cols": 320, "rows": 160 },
  "world_aspect": 1.778,           // natural width / height of source
  "channels": ["brightness", "edge_mag", "edge_angle", "region"],
  "encoding": "base64-u8",
  "data": {
    "brightness": "<base64>",      // Uint8, 0=black 255=white
    "edge_mag":   "<base64>",      // Uint8, 0=flat 255=sharp edge
    "edge_angle": "<base64>",      // Uint8, (angle+π)/(2π)×255
    "region":     "<base64>"       // Uint8, 0=outside 1=water 2=shore 3=veg
  },
  "legend": { "region": { "0": "outside", "1": "water", "2": "shore", "3": "vegetation" } },
  "ramps": { ... },                // glyph ramp strings, same as RAMPS constant
  "config": { ... }               // knob values used for this bake (traceability)
}
```
