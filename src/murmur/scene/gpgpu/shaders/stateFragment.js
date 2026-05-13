export default /* glsl */`
  uniform float uDt;
  uniform float uDissolveRate;
  uniform float uDissolveGroupMask;
  uniform float uMagnifyTarget;
  uniform float uMagnifyGroupMask;
  uniform float uChopAdvance;
  uniform float uChopGroupMask;

  // Sculpt resonance: 16 per-group values packed into 4 vec4 uniforms
  uniform float uSculptMode;
  uniform vec4  uSculptRes0;
  uniform vec4  uSculptRes1;
  uniform vec4  uSculptRes2;
  uniform vec4  uSculptRes3;
  uniform float uSculptMaxMag;

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
    vec4 s  = texture2D( textureState,    uv );

    vec4 velData = texture2D( textureVelocity, uv );
    float gBin   = floor( velData.w * 15.0 + 0.5 );

    // Per-effect group bits from float bitmasks
    float dissolveBit = mod( floor( uDissolveGroupMask / pow( 2.0, gBin ) ), 2.0 );
    float magnifyBit  = mod( floor( uMagnifyGroupMask  / pow( 2.0, gBin ) ), 2.0 );
    float chopBit     = mod( floor( uChopGroupMask     / pow( 2.0, gBin ) ), 2.0 );

    // r: cohesive — drifts toward 1.0 always
    float cohesive = s.r + ( 1.0 - s.r ) * min( 1.0, uDt * 2.0 );

    // g: dissolved
    float dissolveActive = dissolveBit > 0.5 ? 1.0 : 0.0;
    float dissolved = s.g * max( 0.0, 1.0 - uDt * 2.0 )
                    + uDissolveRate * uDt * dissolveActive;

    // b: magnify — reactive path targets masked groups
    float magnifyActive = magnifyBit > 0.5 ? 1.0 : 0.0;
    float magnifyTgt    = uMagnifyTarget * magnifyActive;

    // Sculpt path: resonance-driven magnify, takes max with reactive target
    if ( uSculptMode > 0.5 ) {
      float res        = getSculptRes( gBin );
      float sculptMag  = res * uSculptMaxMag;
      magnifyTgt       = max( magnifyTgt, sculptMag );
    }

    float magnify = s.b + ( magnifyTgt - s.b ) * min( 1.0, uDt * 4.0 );

    // a: chop phase
    float chopActive = chopBit > 0.5 ? 1.0 : 0.0;
    float chopPhase  = mod( s.a + uChopAdvance * uDt * chopActive, 4.0 );

    gl_FragColor = vec4(
      clamp( cohesive,  0.0, 1.0 ),
      clamp( dissolved, 0.0, 1.0 ),
      max(   magnify,   0.0 ),
      chopPhase
    );
  }
`
