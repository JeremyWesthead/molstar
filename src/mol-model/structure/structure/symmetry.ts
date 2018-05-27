/**
 * Copyright (c) 2017 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import Structure from './structure'
import { Selection } from '../query'
import { ModelSymmetry } from '../model'
import { Task } from 'mol-task';
import { SortedArray } from 'mol-data/int';
import Unit from './unit';
import { EquivalenceClasses, hash2 } from 'mol-data/util';
import { Vec3 } from 'mol-math/linear-algebra';
import { SymmetryOperator, Spacegroup, SpacegroupCell } from 'mol-math/geometry';

namespace StructureSymmetry {
    export function buildAssembly(structure: Structure, asmName: string) {
        return Task.create('Build Assembly', async ctx => {
            const models = Structure.getModels(structure);
            if (models.length !== 1) throw new Error('Can only build assemblies from structures based on 1 model.');

            const assembly = ModelSymmetry.findAssembly(models[0], asmName);
            if (!assembly) throw new Error(`Assembly '${asmName}' is not defined.`);

            const assembler = Structure.Builder();

            for (const g of assembly.operatorGroups) {
                const selection = await g.selector(structure).runAsChild(ctx);
                if (Selection.structureCount(selection) === 0) {
                    continue;
                }
                const { units } = Selection.unionStructure(selection);

                for (const oper of g.operators) {
                    for (const unit of units) {
                        assembler.addWithOperator(unit, oper);
                    }
                }
            }

            return assembler.getStructure();
        });
    }

    export function builderSymmetryMates(structure: Structure, radius: number) {
        // TODO: do it properly
        return buildSymmetryRange(structure, Vec3.create(-3, -3, -3), Vec3.create(3, 3, 3));
    }

    export function buildSymmetryRange(structure: Structure, ijkMin: Vec3, ijkMax: Vec3) {
        return Task.create('Build Assembly', async ctx => {
            const models = Structure.getModels(structure);
            if (models.length !== 1) throw new Error('Can only build symmetries from structures based on 1 model.');

            const { spacegroup } = models[0].symmetry;
            if (SpacegroupCell.isZero(spacegroup.cell)) return structure;

            const operators: SymmetryOperator[] = [];
            for (let op = 0; op < spacegroup.operators.length; op++) {
                for (let i = ijkMin[0]; i < ijkMax[0]; i++) {
                    for (let j = ijkMin[1]; j < ijkMax[1]; j++) {
                        for (let k = ijkMin[2]; k < ijkMax[2]; k++) {
                            operators[operators.length] = Spacegroup.getSymmetryOperator(spacegroup, op, i, j, k);
                        }
                    }
                }
            }

            const assembler = Structure.Builder();

            const { units } = structure;
            for (const oper of operators) {
                for (const unit of units) {
                    assembler.addWithOperator(unit, oper);
                }
            }

            return assembler.getStructure();
        });
    }

    function hashUnit(u: Unit) {
        return hash2(u.invariantId, SortedArray.hashCode(u.elements));
    }

    function areUnitsEquivalent(a: Unit, b: Unit) {
        return a.invariantId === b.invariantId && a.model.id === b.model.id && SortedArray.areEqual(a.elements, b.elements);
    }

    export function UnitEquivalenceBuilder() {
        return EquivalenceClasses<number, Unit>(hashUnit, areUnitsEquivalent);
    }

    export function getTransformGroups(s: Structure): ReadonlyArray<Unit.SymmetryGroup> {
        const groups = UnitEquivalenceBuilder();
        for (const u of s.units) groups.add(u.id, u);

        const ret: Unit.SymmetryGroup[] = [];
        for (const eqUnits of groups.groups) {
            const first = s.unitMap.get(eqUnits[0]);
            ret.push({ elements: first.elements, units: eqUnits.map(id => s.unitMap.get(id)) });
        }

        return ret;
    }
}

export default StructureSymmetry;