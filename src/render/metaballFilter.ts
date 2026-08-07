import { Filter, GlProgram, defaultFilterVert } from 'pixi.js';

/**
 * Turns a blurred field of soft bodies into one crisp liquid surface, and
 * shades it like glass while it's at it.
 *
 * The blurred alpha arriving here is effectively a distance field: it sits at
 * the cutoff on the surface and climbs to 1 deep inside. That single value
 * gives us everything the look needs, and because it is measured on the
 * *merged* field, the shading follows fused shapes correctly - two drops
 * bridging get one continuous shell, not two overlapping outlines.
 *
 *   - alpha  : thresholded for the silhouette, then dense at the shell and
 *              see-through in the middle
 *   - colour : darkened through the shell, where refraction piles light up
 *   - rim    : a bright line riding the very outside of the surface
 *
 * PixiJS's stock ColorMatrixFilter can do the threshold but re-premultiplies by
 * the boosted alpha, which blows every drop out to white - hence the hand
 * written pass.
 */
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uCutoff;
uniform float uSoftness;
uniform float uCenterAlpha;
uniform float uEdgeAlpha;
uniform float uRimDepth;
uniform float uEdgeDarken;
uniform float uRimLight;

void main()
{
    vec4 src = texture(uTexture, vTextureCoord);
    float field = src.a;
    vec3 rgb = field > 0.0001 ? src.rgb / field : vec3(0.0);

    float mask = smoothstep(uCutoff - uSoftness, uCutoff + uSoftness, field);
    // 0 exactly on the surface, 1 once we are well inside the body.
    float depth = clamp((field - uCutoff) / uRimDepth, 0.0, 1.0);

    float alpha = mix(uEdgeAlpha, uCenterAlpha, depth) * mask;
    vec3 color = rgb * mix(uEdgeDarken, 1.0, depth);

    float rim = 1.0 - smoothstep(0.0, 0.35, depth);
    color += vec3(rim * rim * uRimLight);

    finalColor = vec4(color * alpha, alpha);
}
`;

export interface MetaballFilterOptions {
  cutoff: number;
  softness: number;
  centerAlpha: number;
  edgeAlpha: number;
  rimDepth: number;
  edgeDarken: number;
  rimLight: number;
}

interface MetaballUniforms {
  uCutoff: number;
  uSoftness: number;
  uCenterAlpha: number;
  uEdgeAlpha: number;
  uRimDepth: number;
  uEdgeDarken: number;
  uRimLight: number;
}

export class MetaballFilter extends Filter {
  constructor(options: MetaballFilterOptions) {
    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment,
        name: 'aerodrop-metaball-glass',
      }),
      resources: {
        metaballUniforms: {
          uCutoff: { value: options.cutoff, type: 'f32' },
          uSoftness: { value: options.softness, type: 'f32' },
          uCenterAlpha: { value: options.centerAlpha, type: 'f32' },
          uEdgeAlpha: { value: options.edgeAlpha, type: 'f32' },
          uRimDepth: { value: options.rimDepth, type: 'f32' },
          uEdgeDarken: { value: options.edgeDarken, type: 'f32' },
          uRimLight: { value: options.rimLight, type: 'f32' },
        },
      },
    });
  }

  private get uniforms(): MetaballUniforms {
    return this.resources.metaballUniforms.uniforms as MetaballUniforms;
  }

  set cutoff(value: number) {
    this.uniforms.uCutoff = value;
  }

  /**
   * Edge softness is held at a constant number of *screen* pixels, so the
   * liquid surface reads the same whether the camera is tight or pulled back.
   * Callers pass the current blur strength in screen pixels.
   */
  setSoftnessForBlur(blurScreenPx: number): void {
    this.uniforms.uSoftness = Math.min(0.34, Math.max(0.035, 1.6 / Math.max(2, blurScreenPx)));
  }
}
