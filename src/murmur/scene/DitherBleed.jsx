import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import useMurmurStore from '@/murmur/store/useMurmurStore.js'

const DitherBleedShader = {
  uniforms: {
    tDiffuse:        { value: null },
    uResolution:     { value: new THREE.Vector2(1, 1) },
    uDitherStrength: { value: 0.65 },
    uBleedStrength:  { value: 0.20 },
    uTime:           { value: 0 },
    uGrainPos:       { value: 0 },    // 0..1 scrub position in audio
    uEchoStrength:   { value: 0 },    // 0..1 overall grain echo intensity
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
    uniform float     uBleedStrength;
    uniform float     uTime;
    uniform float     uGrainPos;
    uniform float     uEchoStrength;
    varying vec2 vUv;

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

    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
      vec2 texel = 1.0 / uResolution;
      vec4 color = texture2D(tDiffuse, vUv);

      // Ink bleed: 5x5 luminance-weighted neighborhood diffusion
      vec3  bleed  = vec3(0.0);
      float totalW = 0.0;
      for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
          if (dx == 0 && dy == 0) continue;
          vec2  off  = vec2(float(dx), float(dy));
          float d2   = dot(off, off);
          vec4  s    = texture2D(tDiffuse, vUv + off * texel);
          float w    = lum(s.rgb) * exp(-d2 / 6.0);
          bleed  += s.rgb * w;
          totalW += w;
        }
      }
      vec3 bled = totalW > 0.0 ? mix(color.rgb, bleed / totalW, uBleedStrength) : color.rgb;

      // ── Grain echo: directional smear from grain position angle ─────────
      // grainPos maps to an angle (azimuth → position in audio), so we smear
      // in that direction to ghost where the grain is reading from.
      if (uEchoStrength > 0.005) {
        float angle   = uGrainPos * 6.2832;
        vec2  echoDir = vec2(cos(angle), sin(angle) * 0.5);  // slight vertical squash
        vec2  echoUv  = clamp(vUv + echoDir * 0.008 * uEchoStrength, 0.0, 1.0);
        vec3  echoCol = texture2D(tDiffuse, echoUv).rgb;
        // additive ghost — only adds to existing bright geometry, not black space
        bled = bled + echoCol * uEchoStrength * 0.35;

        // Sparse sparkle: flickers at existing cloud pixels in dark surrounding areas
        float existingLum = lum(color.rgb);
        float atCloud     = smoothstep(0.01, 0.10, existingLum);
        float brightness  = lum(bled);
        float darkish     = 1.0 - smoothstep(0.0, 0.55, brightness);
        // Step time to 14fps so sparkle flickers visibly
        float t        = floor(uTime * 14.0);
        float noise    = hash(floor(vUv * 280.0) + vec2(t * 13.7, t * 7.3));
        float sparkle  = step(1.0 - uEchoStrength * 0.22, noise) * atCloud * darkish;
        bled = bled + vec3(sparkle * 0.30);
      }

      // Bayer ordered dithering — strongest on bright pixels
      float brightness  = lum(bled);
      float brightMask  = smoothstep(0.05, 0.55, brightness);
      vec2  coord       = floor(vUv * uResolution);
      float threshold   = bayerThreshold(coord.x, coord.y);
      float dither      = (threshold - 0.5) * uDitherStrength * brightMask;

      // Edge vignette — darkens corners and edges, center unaffected
      vec2  vc       = vUv - 0.5;
      float vigDist  = dot(vc, vc) * 4.0;
      float vignette = mix(0.55, 1.0, 1.0 - smoothstep(0.25, 1.0, vigDist));

      gl_FragColor = vec4(clamp((bled + dither) * vignette, 0.0, 1.0), color.a);
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

  useFrame((state) => {
    if (!composerRef.current) return
    const { pass, composer } = composerRef.current

    pass.uniforms.uTime.value = state.clock.getElapsedTime()

    const sp = useMurmurStore.getState().sculptParams
    if (sp) {
      const normGrain = Math.min(1, Math.max(0, (sp.grainSize - 0.02) / 0.23))
      const speedT    = Math.min(1, (sp.speed ?? 0) / 0.02)
      pass.uniforms.uGrainPos.value     = sp.positionFraction ?? 0
      pass.uniforms.uEchoStrength.value = Math.min(0.9, normGrain * 0.5 + speedT * 0.5)
    } else {
      pass.uniforms.uEchoStrength.value = Math.max(0, pass.uniforms.uEchoStrength.value - 0.02)
    }

    composer.render()
  }, 1)

  return null
}
