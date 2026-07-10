export const RAIN_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D colorTexture;
uniform float time;
uniform float intensity;
uniform vec4 effectColor;
in vec2 v_textureCoordinates;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  vec2 uv = v_textureCoordinates;
  vec2 cell = floor(vec2(uv.x * 120.0, (uv.y + time * 0.9) * 55.0));
  float drop = step(0.965 - intensity * 0.04, hash(cell));
  float streak = 1.0 - smoothstep(0.0, 0.05, abs(fract((uv.y + time) * 55.0) - 0.5));
  vec3 rainColor = effectColor.rgb * drop * streak * intensity;
  out_FragColor = vec4(sceneColor.rgb + rainColor, sceneColor.a);
}
`;

export const SNOW_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D colorTexture;
uniform float time;
uniform float intensity;
uniform vec4 effectColor;
in vec2 v_textureCoordinates;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.0, 289.0))) * 45758.5453);
}

void main() {
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  vec2 uv = v_textureCoordinates;
  vec2 cell = floor(vec2((uv.x + sin(time + uv.y * 7.0) * 0.01) * 70.0, (uv.y + time * 0.18) * 70.0));
  vec2 local = fract(vec2((uv.x + sin(time + uv.y * 7.0) * 0.01) * 70.0, (uv.y + time * 0.18) * 70.0)) - 0.5;
  float flake = step(0.82 - intensity * 0.12, hash(cell)) * (1.0 - smoothstep(0.0, 0.15, length(local)));
  out_FragColor = vec4(mix(sceneColor.rgb, effectColor.rgb, flake * intensity), sceneColor.a);
}
`;

export const FOG_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D colorTexture;
uniform vec4 fogColor;
uniform float intensity;
in vec2 v_textureCoordinates;

void main() {
  vec4 sceneColor = texture(colorTexture, v_textureCoordinates);
  float horizon = smoothstep(0.0, 0.85, 1.0 - abs(v_textureCoordinates.y - 0.5) * 1.25);
  float amount = clamp(intensity * (0.35 + 0.65 * horizon), 0.0, 1.0);
  out_FragColor = vec4(mix(sceneColor.rgb, fogColor.rgb, amount), sceneColor.a);
}
`;
