in vec2 v_st;
in vec3 v_normalEC;
in vec4 v_color;

void main() {
  vec2 gridCoordinates = vec2(v_st.x * 16., v_st.y * 6.);
  vec2 derivative = max(fwidth(gridCoordinates), vec2(.0001));
  vec2 lineDistance = abs(fract(gridCoordinates - .5) - .5) / derivative;
  float grid = 1. - min(min(lineDistance.x, lineDistance.y), 1.);

  float scanCenter = fract(czm_frameNumber * .004);
  float scanDistance = abs(fract(v_st.x - scanCenter + .5) - .5);
  float scan = 1. - smoothstep(.015, .065, scanDistance);
  float lighting = .42 + .58 * abs(dot(normalize(v_normalEC), normalize(czm_lightDirectionEC)));

  vec3 glow = mix(v_color.rgb * lighting, vec3(.72, .96, 1.), grid * .72);
  glow += vec3(.2, .8, 1.) * scan * .55;
  float alpha = clamp(v_color.a + grid * .2 + scan * .16, 0., .92);
  out_FragColor = vec4(glow, alpha);
}
