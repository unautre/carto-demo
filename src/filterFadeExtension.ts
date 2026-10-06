import { LayerExtension, type Layer } from '@deck.gl/core';

export interface FilterFadeExtensionProps {
  /** Same accessor as `DataFilterExtension`'s `getFilterValue` — this extension reuses it for its own GPU buffer. */
  getFilterValue?: (d: unknown) => number;
  fadeFilterEnabled?: boolean;
  fadeFilterRange?: readonly [number, number];
}

// A single vec4 (min, max, enabled, unused) instead of separate bool/float fields, to sidestep
// std140 uniform-buffer packing/alignment rules entirely — the same reason DataFilterExtension's
// own shader module packs all of its numeric uniforms into vec4s rather than bare floats.
const uniformBlock = /* glsl */ `\
layout(std140) uniform filterFadeUniforms {
  vec4 params;
} filterFade;
`;

const vs = /* glsl */ `
${uniformBlock}
in float fadeFilterValue;
out float filterFade_factor;
`;

const fs = /* glsl */ `
${uniformBlock}
in float filterFade_factor;
`;

const inject = {
  // Computed once per vertex, from a uniform (cheap, updated every frame) and this extension's own
  // per-row attribute (recomputed only when the filter code itself changes, same as DataFilterExtension's
  // own filterValues) — not from a JS accessor re-run on the CPU every time the range moves.
  'vs:#main-start': /* glsl */ `
    filterFade_factor = 1.0;
    if (filterFade.params.z > 0.5) {
      float filterFade_span = max(filterFade.params.y - filterFade.params.x, 1e-6);
      filterFade_factor = clamp((fadeFilterValue - filterFade.params.x) / filterFade_span, 0.0, 1.0);
    }
  `,
  'fs:DECKGL_FILTER_COLOR': /* glsl */ `
    if (filterFade.params.z > 0.5) {
      color.a *= filterFade_factor;
    }
  `,
};

function getUniforms(opts?: { fadeFilterEnabled?: boolean; fadeFilterRange?: readonly [number, number] }) {
  const enabled = opts?.fadeFilterEnabled ?? false;
  const [min, max] = opts?.fadeFilterRange ?? [0, 1];
  return { params: [min, max, enabled ? 1 : 0, 0] };
}

const filterFadeShaderModule = {
  name: 'filterFade',
  vs,
  fs,
  inject,
  getUniforms,
  uniformTypes: { params: 'vec4<f32>' },
};

/**
 * Fades an object's opacity from 0% at the start of the data filter's active range to 100% at its
 * end (e.g. "recent" rows fully visible, "older" ones fading toward transparent). Entirely GPU-side:
 * `fadeFilterRange` only ever updates a uniform — cheap, every frame, e.g. as the Timeline autoplays
 * — never a per-row attribute. A JS-accessor-driven opacity would instead need the whole colour
 * buffer recomputed and re-uploaded on every tick the range moves.
 *
 * Meant to be attached alongside `DataFilterExtension` on the same layer (see `layerExtensions.ts`'s
 * `EXTENSIONS`), driven by the same `getFilterValue` code — it can't read DataFilterExtension's own
 * per-row filter value (that attribute is internal to that extension), so it keeps its own copy via
 * an identical accessor-driven attribute instead.
 */
export default class FilterFadeExtension extends LayerExtension {
  static extensionName = 'FilterFadeExtension';
  static defaultProps = {
    fadeFilterEnabled: false,
    fadeFilterRange: [0, 1],
  };

  getShaders(this: Layer<FilterFadeExtensionProps>) {
    return { modules: [filterFadeShaderModule] };
  }

  initializeState(this: Layer<FilterFadeExtensionProps>) {
    this.getAttributeManager()?.add({
      fadeFilterValue: {
        size: 1,
        type: 'float32',
        stepMode: 'dynamic',
        accessor: 'getFilterValue',
      },
    });
  }

  draw(this: Layer<FilterFadeExtensionProps>) {
    const { fadeFilterEnabled, fadeFilterRange } = this.props;
    this.setShaderModuleProps({ filterFade: { fadeFilterEnabled, fadeFilterRange } });
  }
}
