import * as THREE from 'three'

// Render-side shaders for the GPGPU path.
// Position is read from the GPGPU position texture via the `aUv` per-particle
// attribute instead of from the `position` buffer attribute.  All visual logic
// (wriggle, bass spray, sculpt, etc.) is identical to pointShader.js so the
// two paths are visually interchangeable.

export const vertexShaderGpgpu = /* glsl */`
  uniform float uTime;
  uniform float uPointSize;
  uniform float uBassEnergy;
  uniform float uMidEnergy;
  uniform float uTrebleEnergy;
  uniform vec3  uCameraTarget;
  uniform float uSizeAttenuation;
  uniform float uSculptElev;
  uniform float uSculptDist;
  uniform float uSculptSpeed;
  uniform sampler2D uPositionTex;
  uniform sampler2D uStateTex;

  attribute vec3 color;
  attribute vec2 aUv;

  varying vec3  vColor;
  varying float vDistToTarget;
  varying float vAlpha;

  void main() {
    vColor = color;

    // Read GPGPU position — all reactive motion comes from the compute passes
    vec4 posData   = texture2D( uPositionTex, aUv );
    vec4 stateData = texture2D( uStateTex,    aUv );
    vec3 pos       = posData.xyz;

    // Sculpt: elevation-driven vertical stretch (camera-position driven, not audio)
    float sculptStretch = uSculptElev * sin( pos.y * 2.5 + uTime * 0.5 ) * 0.06;
    pos.y = pos.y + sculptStretch;

    // Sculpt: speed-driven shimmer
    float shimmerX = sin( uTime * 25.0 + posData.x * 30.0 ) * uSculptSpeed * 0.04;
    float shimmerZ = cos( uTime * 25.0 + posData.z * 25.0 ) * uSculptSpeed * 0.04;
    pos.x = pos.x + shimmerX;
    pos.z = pos.z + shimmerZ;

    vDistToTarget = distance( pos, uCameraTarget );

    // state.b = magnify (0..1, driven by MAGNIFY effect); state.g = dissolved
    float magnify = stateData.b;
    vAlpha = 1.0 - stateData.g;

    vec4 mvPosition = modelViewMatrix * vec4( pos, 1.0 );
    gl_Position = projectionMatrix * mvPosition;

    float attenuation = uSizeAttenuation > 0.5
      ? ( 1.0 / -mvPosition.z )
      : 1.0;

    float sculptSize = 1.0 + uSculptDist * 1.8;
    // Bass energy still pulses point size globally; magnify scales affected groups up to 5×
    gl_PointSize = uPointSize * ( 1.0 + uBassEnergy * 2.5 + magnify * 5.0 ) * attenuation * sculptSize;
  }
`

export const fragmentShaderGpgpu = /* glsl */`
  uniform float uOpacity;
  uniform float uMidEnergy;
  uniform float uBassEnergy;
  uniform float uTrebleEnergy;
  uniform vec3  uTintBass;
  uniform vec3  uTintTreble;
  uniform float uSculptElev;
  uniform float uSculptDist;
  uniform float uSculptSpeed;

  varying vec3  vColor;
  varying float vDistToTarget;
  varying float vAlpha;

  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length( uv );
    if ( dist > 0.5 ) discard;

    float edgeSoft = 0.30 - uBassEnergy * 0.18;
    float alpha = 1.0 - smoothstep( edgeSoft, 0.50, dist );

    vec3 col = vColor;
    col = mix( col, uTintBass,   uBassEnergy   * 0.28 );
    col = mix( col, uTintTreble, uTrebleEnergy * 0.22 );
    col = col * ( 1.0 + uMidEnergy * 0.30 );

    float elevWarm = max( 0.0, -uSculptElev );
    float elevCool = max( 0.0,  uSculptElev );
    col = mix( col, vec3( 1.0, 0.35, 0.05 ), elevWarm * 0.28 );
    col = mix( col, vec3( 0.05, 0.45, 1.0 ), elevCool * 0.28 );

    col = col * ( 1.0 + uSculptDist * 0.30 );

    float edgeDissolve = smoothstep( 0.0, 0.50, dist ) * uSculptSpeed;
    alpha = alpha * ( 1.0 - edgeDissolve * 0.75 );

    col = col * 0.80;

    gl_FragColor = vec4( col, alpha * uOpacity * vAlpha );
  }
`

export function makeUniformsGpgpu() {
  return {
    // All legacy uniforms — audio drivers write to these via uniformsRef
    uTime:            { value: 0 },
    uPointSize:       { value: 4.0 },
    uBassEnergy:      { value: 0 },
    uMidEnergy:       { value: 0 },
    uTrebleEnergy:    { value: 0 },
    uCameraTarget:    { value: new THREE.Vector3(0, 0, 0) },
    uSizeAttenuation: { value: 1.0 },
    uOpacity:         { value: 0.50 },
    uTintBass:        { value: new THREE.Color(0.725, 0.627, 0.878) },
    uTintTreble:      { value: new THREE.Color(0.784, 0.835, 0.753) },
    uSculptElev:      { value: 0 },
    uSculptDist:      { value: 0 },
    uSculptSpeed:     { value: 0 },
    // GPGPU texture samplers — updated each frame in useFrame
    uPositionTex:     { value: null },
    uStateTex:        { value: null },
  }
}
