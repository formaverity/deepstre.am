// GPUComputationRenderer auto-injects sampler uniforms for all listed
// dependencies and #define resolution vec2(w, h) at the top.

export default /* glsl */`
  uniform float uTime;
  uniform float uDt;
  uniform float uReturnForce;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 posData   = texture2D( texturePosition, uv );
    vec4 velData   = texture2D( textureVelocity, uv );
    vec4 homeData  = texture2D( textureHome,     uv );
    vec4 stateData = texture2D( textureState,    uv );

    vec3  pos        = posData.xyz;
    vec3  vel        = velData.xyz;
    vec3  home       = homeData.xyz;
    float effectMask = homeData.w;

    // Chop: pick a displacement offset based on which of the 4 phase slots is active.
    // chopPhase cycles 0→4 and is advanced only for particles in the chop group.
    float chopPhase = stateData.a;
    float phaseIdx  = floor( chopPhase );
    vec3 chopOffset = vec3( 0.0 );
    if      ( phaseIdx < 0.5 ) chopOffset = vec3(  0.00,  0.00, 0.00 );
    else if ( phaseIdx < 1.5 ) chopOffset = vec3(  0.09,  0.00, 0.00 );
    else if ( phaseIdx < 2.5 ) chopOffset = vec3( -0.09,  0.00, 0.00 );
    else                       chopOffset = vec3(  0.00,  0.09, 0.00 );

    // Integrate velocity
    vec3 newPos = pos + vel * uDt;

    // Spring toward (home + chop displacement) so the snap tension
    // fights velocity naturally without needing separate force uniforms.
    vec3 delta = ( home + chopOffset ) - newPos;
    newPos += delta * uReturnForce * uDt * effectMask;

    gl_FragColor = vec4( newPos, posData.w );
  }
`
