export default /* glsl */`
  uniform float uTime;
  uniform float uDt;
  uniform float uExplodeStrength;
  uniform float uExplodeGroupMask;

  // Sculpt resonance: 16 per-group values packed into 4 vec4 uniforms
  uniform float uSculptMode;
  uniform vec4  uSculptRes0;   // groups  0-3
  uniform vec4  uSculptRes1;   // groups  4-7
  uniform vec4  uSculptRes2;   // groups  8-11
  uniform vec4  uSculptRes3;   // groups 12-15
  uniform float uSculptImpulse;

  float getSculptRes( float gb ) {
    if      ( gb < 0.5  ) return uSculptRes0.x;
    else if ( gb < 1.5  ) return uSculptRes0.y;
    else if ( gb < 2.5  ) return uSculptRes0.z;
    else if ( gb < 3.5  ) return uSculptRes0.w;
    else if ( gb < 4.5  ) return uSculptRes1.x;
    else if ( gb < 5.5  ) return uSculptRes1.y;
    else if ( gb < 6.5  ) return uSculptRes1.z;
    else if ( gb < 7.5  ) return uSculptRes1.w;
    else if ( gb < 8.5  ) return uSculptRes2.x;
    else if ( gb < 9.5  ) return uSculptRes2.y;
    else if ( gb < 10.5 ) return uSculptRes2.z;
    else if ( gb < 11.5 ) return uSculptRes2.w;
    else if ( gb < 12.5 ) return uSculptRes3.x;
    else if ( gb < 13.5 ) return uSculptRes3.y;
    else if ( gb < 14.5 ) return uSculptRes3.z;
    else                  return uSculptRes3.w;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    vec4 velData  = texture2D( textureVelocity, uv );
    vec4 posData  = texture2D( texturePosition, uv );
    vec4 homeData = texture2D( textureHome,     uv );

    vec3  vel     = velData.xyz;
    float groupId = velData.w;
    float gBin    = floor( groupId * 15.0 + 0.5 );

    // ── Reactive explode (band-driven, group-masked) ──────────────────────

    float bitVal  = mod( floor( uExplodeGroupMask / pow( 2.0, gBin ) ), 2.0 );
    bool  isActive = bitVal > 0.5;

    if ( isActive && uExplodeStrength > 0.001 ) {
      vec3 home    = homeData.xyz;
      vec3 pos     = posData.xyz;
      vec3 outward = normalize( pos - home + vec3( 0.001, 0.0, 0.0 ) );
      vel += outward * uExplodeStrength * uDt;
    }

    // ── Sculpt resonance impulse (color-affinity driven, per-group) ───────

    if ( uSculptMode > 0.5 ) {
      float res = getSculptRes( gBin );
      if ( res > 0.001 ) {
        vec3 home    = homeData.xyz;
        vec3 pos     = posData.xyz;
        vec3 outward = normalize( pos - home + vec3( 0.001, 0.0, 0.0 ) );
        vel += outward * res * uSculptImpulse * uDt;
      }
    }

    // Frame-rate independent drag
    float drag = pow( 0.96, uDt * 60.0 );
    vel *= drag;

    float speed = length( vel );
    if ( speed > 5.0 ) vel = ( vel / speed ) * 5.0;

    gl_FragColor = vec4( vel, velData.w );
  }
`
