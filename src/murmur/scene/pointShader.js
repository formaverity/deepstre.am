import * as THREE from 'three'

export const vertexShader = /* glsl */`
  uniform float uTime;
  uniform float uPointSize;
  uniform float uBassEnergy;
  uniform float uTrebleEnergy;
  uniform vec3  uCameraTarget;
  uniform float uSizeAttenuation;

  attribute vec3 color;

  varying vec3  vColor;
  varying float vDistanceToTarget;

  void main() {
    vColor = color;

    // Per-point treble jitter — position.xyz seeds the offsets
    vec3 jitter = vec3(
      sin(uTime * 4.0 + position.y * 8.0 + position.x * 3.7),
      sin(uTime * 3.1 + position.z * 7.3 + position.y * 2.9),
      sin(uTime * 5.7 + position.x * 6.1 + position.z * 4.3)
    );
    vec3 pos = position + jitter * (uTrebleEnergy * 0.003);

    vDistanceToTarget = distance(pos, uCameraTarget);

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float attenuation = uSizeAttenuation > 0.5
      ? (1.0 / -mvPosition.z)
      : 1.0;

    gl_PointSize = uPointSize * (1.0 + uBassEnergy * 1.8) * attenuation;
  }
`

export const fragmentShader = /* glsl */`
  uniform float uOpacity;
  uniform float uMidEnergy;
  uniform float uBassEnergy;
  uniform float uTrebleEnergy;
  uniform vec3  uTintBass;
  uniform vec3  uTintTreble;

  varying vec3  vColor;
  varying float vDistanceToTarget;

  void main() {
    // Soft circle — discard outside radius 0.5
    vec2  uv   = gl_PointCoord - 0.5;
    float dist = length(uv);
    if (dist > 0.5) discard;
    float alpha = 1.0 - smoothstep(0.30, 0.50, dist);

    vec3 col = vColor;
    col = mix(col, uTintBass,    uBassEnergy   * 0.4);
    col = mix(col, uTintTreble,  uTrebleEnergy * 0.3);
    col *= 1.0 + uMidEnergy * 0.5;

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
    uOpacity:         { value: 0.85 },
    uTintBass:        { value: new THREE.Color(0.725, 0.627, 0.878) },
    uTintTreble:      { value: new THREE.Color(0.784, 0.835, 0.753) },
  }
}
