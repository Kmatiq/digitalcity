/** Feature metadata access (EXT_mesh_features + EXT_structural_metadata) and colouring. */
import * as THREE from 'three';
import type { MeshFeatures, StructuralMetadata } from '3d-tiles-renderer/plugins';
import { buildingColors, type BuildingProps } from './buildingStyle';

const FEATURE_ATTR = '_feature_id_0';

/** Draco-quantised feature ids arrive as floats (e.g. 516.75): round to the row index. */
const featureId = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v);

interface MetaMesh extends THREE.Mesh {
  userData: { meshFeatures?: MeshFeatures; structuralMetadata?: StructuralMetadata };
}

/** Row count of a property table (reading past it throws). */
function rowCount(meta: StructuralMetadata, table: number): number {
  const acc = (meta as unknown as { tableAccessors?: { count?: number }[] }).tableAccessors;
  return acc?.[table]?.count ?? 0;
}

function tableIndex(mesh: MetaMesh): number | null {
  const info = mesh.userData.meshFeatures?.getFeatureInfo()[0];
  return info?.propertyTable ?? null;
}

/** All property rows for features referenced by this mesh. */
function readAllProps(mesh: MetaMesh, count: number): BuildingProps[] | null {
  const meta = mesh.userData.structuralMetadata;
  const table = tableIndex(mesh);
  if (!meta || table === null) return null;
  const n = Math.min(count, rowCount(meta, table));
  const ids = Array.from({ length: n }, (_, i) => i);
  return meta.getPropertyTableData(
    new Array(count).fill(table),
    ids,
    [],
  ) as unknown as BuildingProps[];
}

/** Bake wall/roof colours per vertex from each feature's usage and construction year. */
export function colorizeMesh(mesh: THREE.Mesh, meshToLocal: THREE.Matrix4): void {
  const g = mesh.geometry;
  const fid = g.getAttribute(FEATURE_ATTR);
  const normal = g.getAttribute('normal');
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  let maxId = 0;
  if (fid) for (let i = 0; i < n; i++) maxId = Math.max(maxId, Math.round(fid.getX(i)));
  const props = fid ? readAllProps(mesh as MetaMesh, maxId + 1) : null;
  const cache = new Map<number, ReturnType<typeof buildingColors>>();
  const fallback = buildingColors({});
  const tmp = new THREE.Vector3();
  // glTF normals are Y-up in the node frame; tile transforms rotate them to ECEF and the
  // layer group maps ECEF to local, so measure "roofness" against local +Y.
  const nm = new THREE.Matrix3().getNormalMatrix(meshToLocal);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const id = fid ? Math.round(fid.getX(i)) : -1;
    let c = cache.get(id);
    if (!c) {
      c = props?.[id] ? buildingColors(props[id]) : fallback;
      cache.set(id, c);
    }
    let roofness = 0;
    if (normal) {
      tmp.fromBufferAttribute(normal, i).applyMatrix3(nm).normalize();
      roofness = tmp.dot(up);
    }
    const col = roofness > 0.35 ? c.roof : c.wall;
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Property row of the feature hit by a ray, or null. */
export function readFeatureProps(hit: THREE.Intersection): BuildingProps | null {
  const mesh = hit.object as MetaMesh;
  const features = mesh.userData.meshFeatures;
  const meta = mesh.userData.structuralMetadata;
  if (!features || !meta || hit.faceIndex == null || !hit.barycoord) return null;
  const ids = features.getFeatures(hit.faceIndex, hit.barycoord);
  const info = features.getFeatureInfo();
  const tables: number[] = [];
  const featureIds: number[] = [];
  info.forEach((fi, i) => {
    const id = featureId(ids[i]);
    if (fi.propertyTable !== null && id !== null && id < rowCount(meta, fi.propertyTable)) {
      tables.push(fi.propertyTable);
      featureIds.push(id);
    }
  });
  if (!tables.length) return null;
  const rows = meta.getPropertyTableData(tables, featureIds, []) as unknown as BuildingProps[];
  return rows[0] ?? null;
}

/** Fallback colour attribute (uniform light plaster). */
export function neutralColors(g: THREE.BufferGeometry): THREE.BufferAttribute {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(0xc8c2b6);
  for (let i = 0; i < n; i++) col.toArray(c, i * 3);
  return new THREE.BufferAttribute(c, 3);
}
