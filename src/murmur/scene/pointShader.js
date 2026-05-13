import * as THREE from 'three'

export const vertexShader = /* glsl */`
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

  attribute vec3 color;

  varying vec3  vColor;
  varying float vDistToTarget;

  void main() {
    vColor = color;

    // Treble: per-point spatial jitter (6x stronger than original)
    vec3 jitter = vec3(
      sin(uTime * 4.0 + position.y * 8.0  + position.x * 3.7),
      sin(uTime * 3.1 + position.z * 7.3  + position.y * 2.9),
      sin(uTime * 5.7 + position.x * 6.1  + position.z * 4.3)
    );
    vec3 pos = position + jitter * (uTrebleEnergy * 0.018);

    // Bass: nonlinear radial spray — small pulse at low levels,
    // explosive outward throw on hard hits (quadratic response)
    float plen = length(pos) + 0.0001;
    pos = pos + (pos / plen) * uBassEnergy * (0.04 + uBassEnergy * 0.22);

    // Bass: per-point vertical spray seeded by mesh position — different
    // parts of the cloud spray up/down independently on peaks
    float sprayV = sin(position.x * 13.7 + position.z * 9.3) * uBassEnergy * uBassEnergy * 0.15;
    pos.y = pos.y + sprayV;

    // Mid: two-axis roll — Y-axis from X position, X-axis from Z position
    float midWave = sin(pos.x * 3.0 + uTime * 1.4) * uMidEnergy * 0.05;
    pos.y = pos.y + midWave;
    float midWave2 = sin(pos.z * 2.8 + uTime * 1.1) * uMidEnergy * 0.04;
    pos.x = pos.x + midWave2;

    // Sculpt: elevation-driven vertical stretch (camera tilt warps cloud)
    float sculptStretch = uSculptElev * sin(pos.y * 2.5 + uTime * 0.5) * 0.06;
    pos.y = pos.y + sculptStretch;

    // Sculpt: speed-driven shimmer (rapid dissolve shimmer when camera moves fast)
    float shimmerX = sin(uTime * 25.0 + position.x * 30.0) * uSculptSpeed * 0.04;
    float shimmerZ = cos(uTime * 25.0 + position.z * 25.0) * uSculptSpeed * 0.04;
    pos.x = pos.x + shimmerX;
    pos.z = pos.z + shimmerZ;

    vDistToTarget = distance(pos, uCameraTarget);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float attenuation = uSizeAttenuation > 0.5
      ? (1.0 / -mvPosition.z)
      : 1.0;

    // Sculpt: distance-driven point magnification (far = bigger)
    float sculptSize = 1.0 + uSculptDist * 1.8;
    gl_PointSize = uPointSize * (1.0 + uBassEnergy * 2.5) * attenuation * sculptSize;
  }
`

export const fragmentShader = /* glsl */`
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

  void main() {
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    // Dynamic bleed: soft edge starts earlier on loud bass hits,
    // making each point bleed outward and decay as energy falls
    float edgeSoft = 0.30 - uBassEnergy * 0.18;
    float alpha = 1.0 - smoothstep(edgeSoft, 0.50, dist);

    vec3 col = vColor;

    // Reactive tinting — more vivid than original
    col = mix(col, uTintBass,   uBassEnergy   * 0.55);
    col = mix(col, uTintTreble, uTrebleEnergy * 0.45);
    col = col * (1.0 + uMidEnergy * 0.7);

    // Sculpt: elevation colour temperature
    // Looking down (elev < 0) → warm orange, looking up (elev > 0) → cool blue
    float elevWarm = max(0.0, -uSculptElev);
    float elevCool = max(0.0,  uSculptElev);
    col = mix(col, vec3(1.0, 0.35, 0.05), elevWarm * 0.75);
    col = mix(col, vec3(0.05, 0.45, 1.0), elevCool * 0.75);

    // Sculpt: distance saturation boost (far = more vivid)
    col = col * (1.0 + uSculptDist * 0.6);

    // Sculpt: speed-driven edge decay (fast movement = points dissolve inward)
    float edgeDissolve = smoothstep(0.0, 0.50, dist) * uSculptSpeed;
    alpha = alpha * (1.0 - edgeDissolve * 0.75);

    // Reduce base brightness significantly — preserves original PLY colour palette
    col = col * 0.60;

    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`

export function makeUniforms() {
  return {
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
  }
}
