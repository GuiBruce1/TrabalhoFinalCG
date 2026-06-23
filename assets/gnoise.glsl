// Gradient Noise by Inigo Quilez - iq/2013
// https://www.shadertoy.com/view/XdXGW8

uniform int uSeed;

vec2 random(vec2 st){
    st = vec2( dot( st, vec2(127.1, 311.7) ),
               dot( st, vec2(269.5, 183.3) ) );
    return -1.0 + 2.0 * fract( sin(st) * (float(uSeed) + .545352515) );
}

float gnoise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    vec2 u = f * f *(3.0 - 2.0 * f);

    return mix( mix( dot( random(i + vec2(0.0,0.0) ), f - vec2(0.0,0.0) ),
                     dot( random(i + vec2(1.0,0.0) ), f - vec2(1.0,0.0) ), u.x),
                mix( dot( random(i + vec2(0.0,1.0) ), f - vec2(0.0,1.0) ),
                     dot( random(i + vec2(1.0,1.0) ), f - vec2(1.0,1.0) ), u.x), u.y);
}