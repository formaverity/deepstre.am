// Home positions are immutable for now — pure pass-through.
// Future effects (home-shifting, morphing) will write new home coords here.
export default /* glsl */`
  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    gl_FragColor = texture2D( textureHome, uv );
  }
`
