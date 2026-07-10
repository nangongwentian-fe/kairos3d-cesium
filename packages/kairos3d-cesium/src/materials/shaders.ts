export const flowMaterialSource = /* glsl */ `
uniform vec4 color;
uniform float speed;
uniform float repeat;
uniform float time;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    float cycle = fract(materialInput.st.s * repeat - time * speed);
    float head = smoothstep(0.0, 0.12, cycle);
    float tail = 1.0 - smoothstep(0.35, 1.0, cycle);
    material.diffuse = color.rgb;
    material.alpha = color.a * head * tail;
    return material;
}
`;

export const radialWaveMaterialSource = /* glsl */ `
uniform vec4 color;
uniform float speed;
uniform float rings;
uniform float time;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    float radius = distance(materialInput.st, vec2(0.5));
    float cycle = fract(radius * rings - time * speed);
    float wave = 1.0 - abs(cycle * 2.0 - 1.0);
    float edge = 1.0 - smoothstep(0.48, 0.5, radius);
    material.diffuse = color.rgb;
    material.alpha = color.a * smoothstep(0.62, 1.0, wave) * edge;
    return material;
}
`;

export const radarScanMaterialSource = /* glsl */ `
uniform vec4 color;
uniform float speed;
uniform float sectorSize;
uniform float time;

czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 offset = materialInput.st - vec2(0.5);
    float radius = length(offset);
    float angle = (atan(offset.y, offset.x) + 3.14159265) / 6.28318531;
    float sweep = fract(time * speed);
    float delta = fract(sweep - angle + 1.0);
    float sector = 1.0 - smoothstep(0.0, sectorSize, delta);
    float edge = 1.0 - smoothstep(0.48, 0.5, radius);
    material.diffuse = color.rgb;
    material.alpha = color.a * max(sector, 0.08) * edge;
    return material;
}
`;
