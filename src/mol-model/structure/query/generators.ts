/**
 * Copyright (c) 2017 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import Query from './query'
import Selection from './selection'
import P from './properties'
import { Structure, Element, Unit } from '../structure'
import { OrderedSet, Segmentation } from 'mol-data/int'

export const all: Query.Provider = async (s, ctx) => Selection.Singletons(s, s);

export interface AtomQueryParams {
    entityTest: Element.Predicate,
    chainTest: Element.Predicate,
    residueTest: Element.Predicate,
    atomTest: Element.Predicate,
    groupBy: Element.Property<any>
}

export interface AtomGroupsQueryParams extends AtomQueryParams {
    groupBy: Element.Property<any>
}

export function residues(params?: Partial<AtomQueryParams>) { return atoms({ ...params, groupBy: P.residue.key }); }
export function chains(params?: Partial<AtomQueryParams>) { return atoms({ ...params, groupBy: P.chain.key }); }

export function atoms(params?: Partial<AtomGroupsQueryParams>): Query.Provider {
    if (!params || (!params.atomTest && !params.residueTest && !params.chainTest && !params.entityTest && !params.groupBy)) return all;
    if (!!params.atomTest && !params.residueTest && !params.chainTest && !params.entityTest && !params.groupBy) return atomGroupsLinear(params.atomTest);

    const normalized: AtomGroupsQueryParams = {
        entityTest: params.entityTest || P.constant.true,
        chainTest: params.chainTest || P.constant.true,
        residueTest: params.residueTest || P.constant.true,
        atomTest: params.atomTest || P.constant.true,
        groupBy: params.groupBy || P.constant.zero,
    };

    if (!params.groupBy) return atomGroupsSegmented(normalized)
    return atomGroupsGrouped(normalized);
}

function atomGroupsLinear(atomTest: Element.Predicate): Query.Provider {
    return async (structure, ctx) => {
        const { units } = structure;
        const l = Element.Location();
        const builder = structure.subsetBuilder(true);

        for (const unit of units) {
            l.unit = unit;
            const elements = unit.elements;

            builder.beginUnit(unit.id);
            for (let j = 0, _j = elements.length; j < _j; j++) {
                l.element = elements[j];
                if (atomTest(l)) builder.addElement(l.element);
            }
            builder.commitUnit();

            if (ctx.shouldUpdate) await ctx.update({ message: 'Atom Groups', current: 0, max: units.length });
        }

        return Selection.Singletons(structure, builder.getStructure());
    };
}

function atomGroupsSegmented({ entityTest, chainTest, residueTest, atomTest }: AtomGroupsQueryParams): Query.Provider {
    return async (structure, ctx) => {
        const { units } = structure;
        const l = Element.Location();
        const builder = structure.subsetBuilder(true);

        for (const unit of units) {
            if (unit.kind !== Unit.Kind.Atomic) continue;

            l.unit = unit;
            const elements = unit.elements;

            builder.beginUnit(unit.id);
            const chainsIt = Segmentation.transientSegments(unit.model.hierarchy.chainSegments, elements);
            const residuesIt = Segmentation.transientSegments(unit.model.hierarchy.residueSegments, elements);
            while (chainsIt.hasNext) {
                const chainSegment = chainsIt.move();
                l.element = OrderedSet.getAt(elements, chainSegment.start);
                // test entity and chain
                if (!entityTest(l) || !chainTest(l)) continue;

                residuesIt.setSegment(chainSegment);
                while (residuesIt.hasNext) {
                    const residueSegment = residuesIt.move();
                    l.element = OrderedSet.getAt(elements, residueSegment.start);

                    // test residue
                    if (!residueTest(l)) continue;

                    for (let j = residueSegment.start, _j = residueSegment.end; j < _j; j++) {
                        l.element = OrderedSet.getAt(elements, j);
                        if (atomTest(l)) {
                            builder.addElement(l.element);
                        }
                    }
                }
            }
            builder.commitUnit();

            if (ctx.shouldUpdate) await ctx.update({ message: 'Atom Groups', current: 0, max: units.length });
        }

        return Selection.Singletons(structure, builder.getStructure());
    };
}

class LinearGroupingBuilder {
    private builders: Structure.SubsetBuilder[] = [];
    private builderMap = new Map<string, Structure.SubsetBuilder>();

    add(key: any, unit: number, element: number) {
        let b = this.builderMap.get(key);
        if (!b) {
            b = this.source.subsetBuilder(true);
            this.builders[this.builders.length] = b;
            this.builderMap.set(key, b);
        }
        b.addToUnit(unit, element);
    }

    private allSingletons() {
        for (let i = 0, _i = this.builders.length; i < _i; i++) {
            if (this.builders[i].elementCount > 1) return false;
        }
        return true;
    }

    private singletonSelection(): Selection {
        const builder = this.source.subsetBuilder(true);
        const loc = Element.Location();
        for (let i = 0, _i = this.builders.length; i < _i; i++) {
            this.builders[i].setSingletonLocation(loc);
            builder.addToUnit(loc.unit.id, loc.element);
        }
        return Selection.Singletons(this.source, builder.getStructure());
    }

    private fullSelection() {
        const structures: Structure[] = new Array(this.builders.length);
        for (let i = 0, _i = this.builders.length; i < _i; i++) {
            structures[i] = this.builders[i].getStructure();
        }
        return Selection.Sequence(this.source, structures);
    }

    getSelection(): Selection {
        const len = this.builders.length;
        if (len === 0) return Selection.Empty(this.source);
        if (this.allSingletons()) return this.singletonSelection();
        return this.fullSelection();
    }

    constructor(private source: Structure) { }
}

function atomGroupsGrouped({ entityTest, chainTest, residueTest, atomTest, groupBy }: AtomGroupsQueryParams): Query.Provider {
    return async (structure, ctx) => {
        const { units } = structure;
        const l = Element.Location();
        const builder = new LinearGroupingBuilder(structure);

        for (const unit of units) {
            if (unit.kind !== Unit.Kind.Atomic) continue;

            l.unit = unit;
            const elements = unit.elements;

            const chainsIt = Segmentation.transientSegments(unit.model.hierarchy.chainSegments, elements);
            const residuesIt = Segmentation.transientSegments(unit.model.hierarchy.residueSegments, elements);
            while (chainsIt.hasNext) {
                const chainSegment = chainsIt.move();
                l.element = OrderedSet.getAt(elements, chainSegment.start);
                // test entity and chain
                if (!entityTest(l) || !chainTest(l)) continue;

                residuesIt.setSegment(chainSegment);
                while (residuesIt.hasNext) {
                    const residueSegment = residuesIt.move();
                    l.element = OrderedSet.getAt(elements, residueSegment.start);

                    // test residue
                    if (!residueTest(l)) continue;

                    for (let j = residueSegment.start, _j = residueSegment.end; j < _j; j++) {
                        l.element = OrderedSet.getAt(elements, j);
                        if (atomTest(l)) builder.add(groupBy(l), unit.id, l.element);
                    }
                }
            }

            if (ctx.shouldUpdate) await ctx.update({ message: 'Atom Groups', current: 0, max: units.length });
        }

        return builder.getSelection();
    };
}