/**
 * Shared building material: vertex-coloured PBR, double-sided so back faces exposed
 * by the slab edge cut are drawn as a flat "section" colour (reads as solid).
 */
import * as THREE from 'three';

export const SECTION_COLOR = new THREE.Color(0xe9dfcf);

export function createBuildingMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.82,
    metalness: 0.0,
    side: THREE.DoubleSide,
    shadowSide: THREE.FrontSide,
  });
  m.name = 'buildings';
  m.userData.baseOnBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    shader.uniforms.uSectionColor = { value: SECTION_COLOR };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSectionColor;')
      .replace(
        '#include <opaque_fragment>',
        'if (!gl_FrontFacing) outgoingLight = uSectionColor * 0.55;\n#include <opaque_fragment>',
      );
  };
  m.onBeforeCompile = m.userData.baseOnBeforeCompile;
  m.customProgramCacheKey = (): string => 'buildings-section';
  return m;
}
