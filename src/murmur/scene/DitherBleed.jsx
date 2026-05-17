import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { fxSettings } from './fxSettings.js'

const DitherBleedShader = {
  uniforms: {
    tDiffuse:        { value: null },
    uResolution:     { value: new THREE.Vector2(1, 1) },
    uDitherStrength: { value: 0.38 },
    uLevels:         { value: 5.0 },
    uNoiseStrength:  { value: 0.30 },
    uMonochrome:     { value: 0.85 },
    uBleedRadius:    { value: 4.0 },
    uBleedThreshold: { value: 0.40 },
    uSaturationBoost:{ value: 0.60 },
    uBleedStrength:  { value: 0.12 },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2      uResolution;
    uniform float     uDitherStrength;
    uniform float     uLevels;
    uniform float     uNoiseStrength;
    uniform float     uMonochrome;
    uniform float     uBleedRadius;
    uniform float     uBleedThreshold;
    uniform float     uSaturationBoost;
    uniform float     uBleedStrength;
    varying vec2      vUv;

    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    // 4×4 Bayer ordered threshold matrix
    float bayerThreshold(float px, float py) {
      int x   = int(mod(px, 4.0));
      int y   = int(mod(py, 4.0));
      int idx = y * 4 + x;
      if (idx ==  0) return  0.0 / 16.0;
      if (idx ==  1) return  8.0 / 16.0;
      if (idx ==  2) return  2.0 / 16.0;
      if (idx ==  3) return 10.0 / 16.0;
      if (idx ==  4) return 12.0 / 16.0;
      if (idx ==  5) return  4.0 / 16.0;
      if (idx ==  6) return 14.0 / 16.0;
      if (idx ==  7) return  6.0 / 16.0;
      if (idx ==  8) return  3.0 / 16.0;
      if (idx ==  9) return 11.0 / 16.0;
      if (idx == 10) return  1.0 / 16.0;
      if (idx == 11) return  9.0 / 16.0;
      if (idx == 12) return 15.0 / 16.0;
      if (idx == 13) return  7.0 / 16.0;
      if (idx == 14) return 13.0 / 16.0;
      return 5.0 / 16.0;
    }

    // Per-pixel hash for noise jitter — breaks up Bayer regularity
    float hash21(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Saturation boost — mix toward chroma away from grey
    vec3 boostSat(vec3 c, float amount) {
      return clamp(mix(vec3(lum(c)), c, 1.0 + amount), 0.0, 1.0);
    }

    // Accumulate one bleed tap: sample at dir*radius, weight by luminance above threshold
    void accumTap(vec2 dir, vec2 texel, inout vec3 acc, inout float w) {
      vec3  s = texture2D(tDiffuse, vUv + dir * uBleedRadius * texel).rgb;
      float l = lum(s);
      if (l > uBleedThreshold) { acc += s * l; w += l; }
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 orig  = texture2D(tDiffuse, vUv);

      // ── 8-tap radial ink bleed ────────────────────────────────────────────
      vec3  bleedAcc = vec3(0.0);
      float bleedW   = 0.0;
      accumTap(vec2( 1.000,  0.000), texel, bleedAcc, bleedW);
      accumTap(vec2( 0.707,  0.707), texel, bleedAcc, bleedW);
      accumTap(vec2( 0.000,  1.000), texel, bleedAcc, bleedW);
      accumTap(vec2(-0.707,  0.707), texel, bleedAcc, bleedW);
      accumTap(vec2(-1.000,  0.000), texel, bleedAcc, bleedW);
      accumTap(vec2(-0.707, -0.707), texel, bleedAcc, bleedW);
      accumTap(vec2( 0.000, -1.000), texel, bleedAcc, bleedW);
      accumTap(vec2( 0.707, -0.707), texel, bleedAcc, bleedW);

      vec3 bled = bleedW > 0.0
        ? mix(orig.rgb, bleedAcc / bleedW, uBleedStrength)
        : orig.rgb;

      // Saturation boost on the blended result
      bled = boostSat(bled, uSaturationBoost);

      // ── Paper / ink monochrome blend ──────────────────────────────────────
      vec3 paper = vec3(0.0275, 0.0431, 0.0314);  // #070b08
      vec3 ink   = vec3(0.8118, 0.8902, 0.8275);  // #cfe3d3
      bled = mix(bled, mix(paper, ink, lum(bled)), uMonochrome);

      // ── Bayer dither with per-pixel noise jitter ──────────────────────────
      float brightness = lum(bled);
      float darkMask   = 1.0 - smoothstep(0.0, 0.4, brightness);
      // Only dither pixels with actual model content — skip near-black background
      float contentMask = smoothstep(0.03, 0.09, brightness);
      vec2  coord      = floor(vUv * uResolution);
      float bayer      = bayerThreshold(coord.x, coord.y);
      float noise      = (hash21(coord) - 0.5) * uNoiseStrength;
      float dither     = (bayer + noise - 0.5) * uDitherStrength * darkMask * contentMask;

      // Quantize to uLevels steps in dark areas; leave bright particles untouched
      vec3  withDither = clamp(bled + dither, 0.0, 1.0);
      float steps      = max(1.0, uLevels - 1.0);
      vec3  quantized  = floor(withDither * steps + 0.5) / steps;

      gl_FragColor = vec4(mix(withDither, quantized, darkMask), orig.a);
    }
  `,
}

export default function DitherBleed() {
  const { gl, scene, camera, size } = useThree()
  const composerRef = useRef(null)

  useEffect(() => {
    const pr = gl.getPixelRatio()
    const w  = size.width  * pr
    const h  = size.height * pr

    const composer = new EffectComposer(gl)
    composer.setSize(w, h)
    composer.addPass(new RenderPass(scene, camera))

    const pass = new ShaderPass(DitherBleedShader)
    pass.uniforms.uResolution.value.set(w, h)
    composer.addPass(pass)

    composerRef.current = { composer, pass }
    return () => { composer.dispose(); composerRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera])

  useEffect(() => {
    if (!composerRef.current) return
    const pr = gl.getPixelRatio()
    const w  = size.width  * pr
    const h  = size.height * pr
    composerRef.current.pass.uniforms.uResolution.value.set(w, h)
    composerRef.current.composer.setSize(w, h)
  }, [size, gl])

  useFrame(() => {
    const c = composerRef.current
    if (!c) return
    const u = c.pass.uniforms
    u.uDitherStrength.value  = fxSettings.ditherStrength
    u.uLevels.value          = fxSettings.levels
    u.uNoiseStrength.value   = fxSettings.noiseStrength
    u.uMonochrome.value      = fxSettings.monochrome
    u.uBleedRadius.value     = fxSettings.bleedRadius
    u.uBleedThreshold.value  = fxSettings.bleedThreshold
    u.uSaturationBoost.value = fxSettings.saturationBoost
    u.uBleedStrength.value   = fxSettings.bleedStrength
    c.composer.render()
  }, 1)

  return null
}
