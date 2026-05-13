import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

const DitherBleedShader = {
  uniforms: {
    tDiffuse:        { value: null },
    uResolution:     { value: new THREE.Vector2(1, 1) },
    uDitherStrength: { value: 0.38 },
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
    uniform float     uBleedStrength;
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

      // Bayer ordered dithering — strongest on dark pixels
      float brightness = lum(bled);
      float darkMask   = 1.0 - smoothstep(0.0, 0.4, brightness);
      vec2  coord      = floor(vUv * uResolution);
      float threshold  = bayerThreshold(coord.x, coord.y);
      float dither     = (threshold - 0.5) * uDitherStrength * darkMask;

      gl_FragColor = vec4(clamp(bled + dither, 0.0, 1.0), color.a);
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

  useFrame(() => { composerRef.current?.composer.render() }, 1)

  return null
}
