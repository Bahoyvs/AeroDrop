import { Filter, GlProgram, defaultFilterVert } from 'pixi.js';

/**
 * Alpha-threshold pass that turns a blurred field of blobs into one crisp
 * liquid surface. PixiJS's stock ColorMatrixFilter can do the threshold, but it
 * re-premultiplies by the boosted alpha and blows every drop out to white; this
 * shader un-premultiplies, thresholds alpha alone, and puts the colour back
 * untouched, so drops keep their tint and still fuse into each other.
 */
const fragment = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uCutoff;
uniform float uSoftness;

void main()
{
    vec4 src = texture(uTexture, vTextureCoord);
    vec3 rgb = src.a > 0.0001 ? src.rgb / src.a : vec3(0.0);
    float alpha = smoothstep(uCutoff - uSoftness, uCutoff + uSoftness, src.a);
    finalColor = vec4(rgb * alpha, alpha);
}
`;

export interface MetaballFilterOptions {
  cutoff: number;
  softness: number;
}

export class MetaballFilter extends Filter {
  constructor(options: MetaballFilterOptions) {
    super({
      glProgram: GlProgram.from({
        vertex: defaultFilterVert,
        fragment,
        name: 'aerodrop-metaball-threshold',
      }),
      resources: {
        metaballUniforms: {
          uCutoff: { value: options.cutoff, type: 'f32' },
          uSoftness: { value: options.softness, type: 'f32' },
        },
      },
    });
  }

  private get uniforms(): { uCutoff: number; uSoftness: number } {
    return this.resources.metaballUniforms.uniforms as { uCutoff: number; uSoftness: number };
  }

  set cutoff(value: number) {
    this.uniforms.uCutoff = value;
  }

  /**
   * Edge softness is kept at a constant number of *screen* pixels, so the
   * liquid surface reads the same whether the camera is tight or pulled way
   * back. Callers pass the current blur strength in screen pixels.
   */
  setSoftnessForBlur(blurScreenPx: number): void {
    this.uniforms.uSoftness = Math.min(0.34, Math.max(0.035, 1.6 / Math.max(2, blurScreenPx)));
  }
}
