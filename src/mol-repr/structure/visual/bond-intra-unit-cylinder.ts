/**
 * Copyright (c) 2018-2021 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { ParamDefinition as PD } from '../../../mol-util/param-definition';
import { VisualContext } from '../../visual';
import { Unit, Structure, StructureElement, Bond } from '../../../mol-model/structure';
import { Theme } from '../../../mol-theme/theme';
import { Mesh } from '../../../mol-geo/geometry/mesh/mesh';
import { Vec3 } from '../../../mol-math/linear-algebra';
import { arrayEqual } from '../../../mol-util';
import { createLinkCylinderImpostors, createLinkCylinderMesh, LinkStyle } from './util/link';
import { UnitsMeshParams, UnitsVisual, UnitsMeshVisual, StructureGroup, UnitsCylindersParams, UnitsCylindersVisual } from '../units-visual';
import { VisualUpdateState } from '../../util';
import { BondType } from '../../../mol-model/structure/model/types';
import { BondCylinderParams, BondIterator, eachIntraBond, getIntraBondLoci, getIntraBondIndexMapping, makeIntraBondIgnoreTest } from './util/bond';
import { Sphere3D } from '../../../mol-math/geometry';
import { IntAdjacencyGraph } from '../../../mol-math/graph';
import { WebGLContext } from '../../../mol-gl/webgl/context';
import { Cylinders } from '../../../mol-geo/geometry/cylinders/cylinders';
import { SortedArray } from '../../../mol-data/int';
// import { IntraUnitBonds } from '../../../mol-model/structure/structure/unit/bonds';

// avoiding namespace lookup improved performance in Chrome (Aug 2020)
const isBondType = BondType.is;

// namespace IntraUnitBondsIncludingParent {
//     export function get(unit: Unit.Atomic, structure: Structure): { unit: Unit.Atomic, bonds: IntraUnitBonds } {

//         return {} as any;
//     }
// }



function getIntraUnitBondCylinderBuilderProps(unit: Unit.Atomic, structure: Structure, theme: Theme, props: PD.Values<IntraUnitBondCylinderParams>) {
    let ignore: undefined | ((edgeIndex: number) => boolean);
    let stub: undefined | ((edgeIndex: number) => boolean);
    let group: undefined | ((edgeIndex: number) => number);
    let radius: (edgeIndex: number) => number;
    let radiusA: (edgeIndex: number) => number;
    let radiusB: (edgeIndex: number) => number;

    const locE = StructureElement.Location.create(structure, unit);
    const locB = Bond.Location(structure, unit, undefined, structure, unit, undefined);

    if (props.includeParent) {
        const _unit = unit;
        structure = structure.root;
        unit = structure.unitMap.get(unit.id) as Unit.Atomic;

        const _ignore = makeIntraBondIgnoreTest(unit, props);
        ignore = (edgeIndex: number) => {
            const eI = elements[a[edgeIndex]];
            return (_ignore && _ignore(edgeIndex)) || !SortedArray.has(_unit.elements, eI);
        };

        stub = (edgeIndex: number) => {
            const eA = elements[a[edgeIndex]];
            const eB = elements[b[edgeIndex]];
            return SortedArray.has(_unit.elements, eA) && !SortedArray.has(_unit.elements, eB);
        };

        const { indexFromParent } = getIntraBondIndexMapping(unit, _unit);
        group = (edgeIndex: number) => indexFromParent.get(edgeIndex)!;

        radius = (edgeIndex: number) => {
            const idx = indexFromParent.get(edgeIndex)!;
            if (idx >= _unit.bonds.edgeCount * 2) {
                return 0.2;
            }
            locB.aIndex = _unit.bonds.a[idx];
            locB.bIndex = _unit.bonds.b[idx];
            return theme.size.size(locB) * sizeFactor;
        };

        radiusA = (edgeIndex: number) => {
            const idx = indexFromParent.get(edgeIndex)!;
            if (idx >= _unit.bonds.edgeCount * 2) {
                return 0.2;
            }
            locE.element = _unit.elements[_unit.bonds.a[idx]];
            return theme.size.size(locE) * sizeFactor;
        };

        radiusB = (edgeIndex: number) => {
            const idx = indexFromParent.get(edgeIndex)!;
            if (idx >= _unit.bonds.edgeCount * 2) {
                return 0.2;
            }
            locE.element = _unit.elements[_unit.bonds.b[idx]];
            return theme.size.size(locE) * sizeFactor;
        };
    } else {
        ignore = makeIntraBondIgnoreTest(unit, props);

        radius = (edgeIndex: number) => {
            locB.aIndex = a[edgeIndex];
            locB.bIndex = b[edgeIndex];
            return theme.size.size(locB) * sizeFactor;
        };

        radiusA = (edgeIndex: number) => {
            locE.element = elements[a[edgeIndex]];
            return theme.size.size(locE) * sizeFactor;
        };

        radiusB = (edgeIndex: number) => {
            locE.element = elements[b[edgeIndex]];
            return theme.size.size(locE) * sizeFactor;
        };
    }

    const elements = unit.elements;
    const bonds = unit.bonds;
    const { edgeCount, a, b, edgeProps, offset } = bonds;
    const { order: _order, flags: _flags } = edgeProps;
    const { sizeFactor, sizeAspectRatio } = props;

    const vRef = Vec3(), delta = Vec3();
    const pos = unit.conformation.invariantPosition;

    return {
        linkCount: edgeCount * 2,
        referencePosition: (edgeIndex: number) => {
            let aI = a[edgeIndex], bI = b[edgeIndex];

            if (aI > bI) [aI, bI] = [bI, aI];
            if (offset[aI + 1] - offset[aI] === 1) [aI, bI] = [bI, aI];
            // TODO prefer reference atoms within rings

            for (let i = offset[aI], il = offset[aI + 1]; i < il; ++i) {
                const _bI = b[i];
                if (_bI !== bI && _bI !== aI) return pos(elements[_bI], vRef);
            }
            for (let i = offset[bI], il = offset[bI + 1]; i < il; ++i) {
                const _aI = a[i];
                if (_aI !== aI && _aI !== bI) return pos(elements[_aI], vRef);
            }
            return null;
        },
        position: (posA: Vec3, posB: Vec3, edgeIndex: number) => {
            const rA = radiusA(edgeIndex), rB = radiusB(edgeIndex);
            const r = Math.min(rA, rB) * sizeAspectRatio;
            const oA = Math.sqrt(Math.max(0, rA * rA - r * r)) - 0.05;
            const oB = Math.sqrt(Math.max(0, rB * rB - r * r)) - 0.05;

            pos(elements[a[edgeIndex]], posA);
            pos(elements[b[edgeIndex]], posB);

            if (oA <= 0.01 && oB <= 0.01) return;

            Vec3.normalize(delta, Vec3.sub(delta, posB, posA));
            Vec3.scaleAndAdd(posA, posA, delta, oA);
            Vec3.scaleAndAdd(posB, posB, delta, -oB);
        },
        style: (edgeIndex: number) => {
            const o = _order[edgeIndex];
            const f = _flags[edgeIndex];
            if (isBondType(f, BondType.Flag.MetallicCoordination) || isBondType(f, BondType.Flag.HydrogenBond)) {
                // show metall coordinations and hydrogen bonds with dashed cylinders
                return LinkStyle.Dashed;
            } else if (o === 2) {
                return LinkStyle.Double;
            } else if (o === 3) {
                return LinkStyle.Triple;
            } else {
                return LinkStyle.Solid;
            }
        },
        radius: (edgeIndex: number) => {
            return radius(edgeIndex) * sizeAspectRatio;
        },
        ignore,
        stub,
        group
    };
}

function createIntraUnitBondCylinderImpostors(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: PD.Values<IntraUnitBondCylinderParams>, cylinders?: Cylinders): Cylinders {
    if (!Unit.isAtomic(unit)) return Cylinders.createEmpty(cylinders);
    if (!unit.bonds.edgeCount) return Cylinders.createEmpty(cylinders);

    const builderProps = getIntraUnitBondCylinderBuilderProps(unit, structure, theme, props);
    const c = createLinkCylinderImpostors(ctx, builderProps, props, cylinders);

    const sphere = Sphere3D.expand(Sphere3D(), unit.boundary.sphere, 1 * props.sizeFactor);
    c.setBoundingSphere(sphere);

    return c;
}

function createIntraUnitBondCylinderMesh(ctx: VisualContext, unit: Unit, structure: Structure, theme: Theme, props: PD.Values<IntraUnitBondCylinderParams>, mesh?: Mesh): Mesh {
    if (!Unit.isAtomic(unit)) return Mesh.createEmpty(mesh);
    if (!unit.bonds.edgeCount) return Mesh.createEmpty(mesh);

    const builderProps = getIntraUnitBondCylinderBuilderProps(unit, structure, theme, props);
    const m = createLinkCylinderMesh(ctx, builderProps, props, mesh);

    const sphere = Sphere3D.expand(Sphere3D(), unit.boundary.sphere, 1 * props.sizeFactor);
    m.setBoundingSphere(sphere);

    return m;
}

export const IntraUnitBondCylinderParams = {
    ...UnitsMeshParams,
    ...UnitsCylindersParams,
    ...BondCylinderParams,
    sizeFactor: PD.Numeric(0.3, { min: 0, max: 10, step: 0.01 }),
    sizeAspectRatio: PD.Numeric(2 / 3, { min: 0, max: 3, step: 0.01 }),
    tryUseImpostor: PD.Boolean(true),
    includeParent: PD.Boolean(false),
};
export type IntraUnitBondCylinderParams = typeof IntraUnitBondCylinderParams

export function IntraUnitBondCylinderVisual(materialId: number, structure: Structure, props: PD.Values<IntraUnitBondCylinderParams>, webgl?: WebGLContext) {
    return props.tryUseImpostor && webgl && webgl.extensions.fragDepth
        ? IntraUnitBondCylinderImpostorVisual(materialId)
        : IntraUnitBondCylinderMeshVisual(materialId);
}

export function IntraUnitBondCylinderImpostorVisual(materialId: number): UnitsVisual<IntraUnitBondCylinderParams> {
    return UnitsCylindersVisual<IntraUnitBondCylinderParams>({
        defaultProps: PD.getDefaultValues(IntraUnitBondCylinderParams),
        createGeometry: createIntraUnitBondCylinderImpostors,
        createLocationIterator: BondIterator.fromGroup,
        getLoci: getIntraBondLoci,
        eachLocation: eachIntraBond,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<IntraUnitBondCylinderParams>, currentProps: PD.Values<IntraUnitBondCylinderParams>, newTheme: Theme, currentTheme: Theme, newStructureGroup: StructureGroup, currentStructureGroup: StructureGroup) => {
            state.createGeometry = (
                newProps.linkScale !== currentProps.linkScale ||
                newProps.linkSpacing !== currentProps.linkSpacing ||
                newProps.ignoreHydrogens !== currentProps.ignoreHydrogens ||
                newProps.linkCap !== currentProps.linkCap ||
                newProps.dashCount !== currentProps.dashCount ||
                newProps.dashScale !== currentProps.dashScale ||
                newProps.dashCap !== currentProps.dashCap ||
                newProps.stubCap !== currentProps.stubCap ||
                !arrayEqual(newProps.includeTypes, currentProps.includeTypes) ||
                !arrayEqual(newProps.excludeTypes, currentProps.excludeTypes)
            );

            if (newProps.includeParent !== currentProps.includeParent) {
                state.createGeometry = true;
                state.updateTransform = true;
                state.updateColor = true;
                state.updateSize = true;
            }

            const newUnit = newStructureGroup.group.units[0];
            const currentUnit = currentStructureGroup.group.units[0];
            if (Unit.isAtomic(newUnit) && Unit.isAtomic(currentUnit)) {
                if (!IntAdjacencyGraph.areEqual(newUnit.bonds, currentUnit.bonds)) {
                    state.createGeometry = true;
                    state.updateTransform = true;
                    state.updateColor = true;
                    state.updateSize = true;
                }
            }
        },
        mustRecreate: (structureGroup: StructureGroup, props: PD.Values<IntraUnitBondCylinderParams>, webgl?: WebGLContext) => {
            return !props.tryUseImpostor || !webgl;
        }
    }, materialId);
}

export function IntraUnitBondCylinderMeshVisual(materialId: number): UnitsVisual<IntraUnitBondCylinderParams> {
    return UnitsMeshVisual<IntraUnitBondCylinderParams>({
        defaultProps: PD.getDefaultValues(IntraUnitBondCylinderParams),
        createGeometry: createIntraUnitBondCylinderMesh,
        createLocationIterator: BondIterator.fromGroup,
        getLoci: getIntraBondLoci,
        eachLocation: eachIntraBond,
        setUpdateState: (state: VisualUpdateState, newProps: PD.Values<IntraUnitBondCylinderParams>, currentProps: PD.Values<IntraUnitBondCylinderParams>, newTheme: Theme, currentTheme: Theme, newStructureGroup: StructureGroup, currentStructureGroup: StructureGroup) => {
            state.createGeometry = (
                newProps.sizeFactor !== currentProps.sizeFactor ||
                newProps.sizeAspectRatio !== currentProps.sizeAspectRatio ||
                newProps.radialSegments !== currentProps.radialSegments ||
                newProps.linkScale !== currentProps.linkScale ||
                newProps.linkSpacing !== currentProps.linkSpacing ||
                newProps.ignoreHydrogens !== currentProps.ignoreHydrogens ||
                newProps.linkCap !== currentProps.linkCap ||
                newProps.dashCount !== currentProps.dashCount ||
                newProps.dashScale !== currentProps.dashScale ||
                newProps.dashCap !== currentProps.dashCap ||
                newProps.stubCap !== currentProps.stubCap ||
                !arrayEqual(newProps.includeTypes, currentProps.includeTypes) ||
                !arrayEqual(newProps.excludeTypes, currentProps.excludeTypes)
            );

            if (newProps.includeParent !== currentProps.includeParent) {
                state.createGeometry = true;
                state.updateTransform = true;
                state.updateColor = true;
                state.updateSize = true;
            }

            const newUnit = newStructureGroup.group.units[0];
            const currentUnit = currentStructureGroup.group.units[0];
            if (Unit.isAtomic(newUnit) && Unit.isAtomic(currentUnit)) {
                if (!IntAdjacencyGraph.areEqual(newUnit.bonds, currentUnit.bonds)) {
                    state.createGeometry = true;
                    state.updateTransform = true;
                    state.updateColor = true;
                    state.updateSize = true;
                }
            }
        },
        mustRecreate: (structureGroup: StructureGroup, props: PD.Values<IntraUnitBondCylinderParams>, webgl?: WebGLContext) => {
            return props.tryUseImpostor && !!webgl;
        }
    }, materialId);
}
