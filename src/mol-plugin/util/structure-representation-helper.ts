/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { PluginStateObject as PSO } from '../../mol-plugin/state/objects';
import { StateTransforms } from '../../mol-plugin/state/transforms';
import { StateTransformer, StateSelection, StateObjectCell, StateTransform, StateBuilder } from '../../mol-state';
import { StructureElement, Structure, StructureSelection, QueryContext } from '../../mol-model/structure';
import { PluginContext } from '../context';
import { StructureRepresentation3DHelpers } from '../state/transforms/representation';
import Expression from '../../mol-script/language/expression';
import { compile } from '../../mol-script/runtime/query/compiler';
import { StructureSelectionQueries as Q } from '../util/structure-selection-helper';
import { MolScriptBuilder as MS } from '../../mol-script/language/builder';
import { VisualQuality } from '../../mol-geo/geometry/base';

type StructureTransform = StateObjectCell<PSO.Molecule.Structure, StateTransform<StateTransformer<any, PSO.Molecule.Structure, any>>>
type RepresentationTransform = StateObjectCell<PSO.Molecule.Structure.Representation3D, StateTransform<StateTransformer<any, PSO.Molecule.Structure.Representation3D, any>>>
const RepresentationManagerTag = 'representation-controls'

export function getRepresentationManagerTag(type: string) {
    return `${RepresentationManagerTag}-${type}`
}

function getCombinedLoci(mode: SelectionModifier, loci: StructureElement.Loci, currentLoci: StructureElement.Loci): StructureElement.Loci {
    switch (mode) {
        case 'add': return StructureElement.Loci.union(loci, currentLoci)
        case 'remove': return StructureElement.Loci.subtract(currentLoci, loci)
        case 'only': return loci
    }
}

type SelectionModifier = 'add' | 'remove' | 'only'

export class StructureRepresentationHelper {
    getRepresentationStructure(rootRef: string, type: string) {
        const state = this.plugin.state.dataState
        const selections = state.select(StateSelection.Generators.ofType(PSO.Molecule.Structure, rootRef).withTag(getRepresentationManagerTag(type)));
        return selections.length > 0 ? selections[0] : undefined
    }

    getRepresentation(rootRef: string, type: string) {
        const reprStructure = this.getRepresentationStructure(rootRef, type)
        if (!reprStructure) return
        const state = this.plugin.state.dataState
        const selections = state.select(StateSelection.Generators.ofType(PSO.Molecule.Structure.Representation3D, reprStructure.transform.ref))
        return selections.length > 0 ? selections[0] : undefined
    }

    private async _set(modifier: SelectionModifier, type: string, loci: StructureElement.Loci, structure: StructureTransform) {
        const state = this.plugin.state.dataState
        const update = state.build()
        const s = structure.obj!.data

        const reprStructure = this.getRepresentationStructure(structure.transform.ref, type)

        if (reprStructure) {
            const currentLoci = StructureElement.Query.toLoci(reprStructure.params!.values.query, s)
            const combinedLoci = getCombinedLoci(modifier, loci, currentLoci)

            update.to(reprStructure).update({
                ...reprStructure.params!.values,
                query: StructureElement.Query.fromLoci(combinedLoci)
            })
        } else {
            const combinedLoci = getCombinedLoci(modifier, loci, StructureElement.Loci(s, []))
            const params = StructureRepresentation3DHelpers.getDefaultParams(this.plugin, type as any, s)

            const p = params.type.params
            if (p.ignoreHydrogens !== undefined) p.ignoreHydrogens = this._ignoreHydrogens
            if (p.quality !== undefined) p.quality = this._quality

            update.to(structure.transform.ref)
                .apply(
                    StateTransforms.Model.LociStructureSelection,
                    { query: StructureElement.Query.fromLoci(combinedLoci), label: type },
                    { tags: [ RepresentationManagerTag, getRepresentationManagerTag(type) ] }
                )
                .apply( StateTransforms.Representation.StructureRepresentation3D, params)
        }

        await this.plugin.runTask(state.updateTree(update, { doNotUpdateCurrent: true }))
    }

    async set(modifier: SelectionModifier, type: string, lociGetter: (structure: Structure) => StructureElement.Loci) {
        const state = this.plugin.state.dataState;
        const structures = state.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Structure))

        for (const structure of structures) {
            const s = structure.obj!.data
            const loci = lociGetter(s)
            await this._set(modifier, type, loci, structure)
        }
    }

    async setFromExpression(modifier: SelectionModifier, type: string, expression: Expression) {
        return this.set(modifier, type, (structure) => {
            const compiled = compile<StructureSelection>(expression)
            const result = compiled(new QueryContext(structure))
            return StructureSelection.toLoci2(result)
        })
    }

    async clear() {
        const { registry } = this.plugin.structureRepresentation
        const state = this.plugin.state.dataState;
        const update = state.build()
        const structures = state.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Structure))
        const query = StructureElement.Query.Empty

        for (const structure of structures) {
            for (let i = 0, il = registry.types.length; i < il; ++i) {
                const type = registry.types[i][0]
                const reprStructure = this.getRepresentationStructure(structure.transform.ref, type)
                if (reprStructure) {
                    update.to(reprStructure).update({ ...reprStructure.params!.values, query })
                }
            }
        }
        await this.plugin.runTask(state.updateTree(update, { doNotUpdateCurrent: true }))
    }

    async eachRepresentation(callback: (repr: RepresentationTransform, update: StateBuilder.Root) => void) {
        const { registry } = this.plugin.structureRepresentation
        const state = this.plugin.state.dataState;
        const update = state.build()
        const structures = state.select(StateSelection.Generators.rootsOfType(PSO.Molecule.Structure))
        for (const structure of structures) {
            for (let i = 0, il = registry.types.length; i < il; ++i) {
                const repr = this.getRepresentation(structure.transform.ref, registry.types[i][0])
                if (repr) callback(repr, update)
            }
        }
        await this.plugin.runTask(state.updateTree(update, { doNotUpdateCurrent: true }))
    }

    private _ignoreHydrogens = false
    get ignoreHydrogens () { return this._ignoreHydrogens }
    async setIgnoreHydrogens(ignoreHydrogens: boolean) {
        if (ignoreHydrogens === this._ignoreHydrogens) return
        await this.eachRepresentation((repr, update) => {
            if (repr.params && repr.params.values.type.params.ignoreHydrogens !== undefined) {
                const { name, params } = repr.params.values.type
                update.to(repr.transform.ref).update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    props => ({ ...props, type: { name, params: { ...params, ignoreHydrogens }}})
                )
            }
        })
        this._ignoreHydrogens = ignoreHydrogens
    }

    private _quality = 'auto' as VisualQuality
    get quality () { return this._quality }
    async setQuality(quality: VisualQuality) {
        if (quality === this._quality) return
        await this.eachRepresentation((repr, update) => {
            if (repr.params && repr.params.values.type.params.quality !== undefined) {
                const { name, params } = repr.params.values.type
                update.to(repr.transform.ref).update(
                    StateTransforms.Representation.StructureRepresentation3D,
                    props => ({ ...props, type: { name, params: { ...params, quality }}})
                )
            }
        })
        this._quality = quality
    }

    async preset() {
        // TODO generalize and make configurable
        await this.clear()
        await this.setFromExpression('add', 'cartoon', Q.all)
        await this.setFromExpression('add', 'carbohydrate', Q.all)
        await this.setFromExpression('add', 'ball-and-stick', MS.struct.modifier.union([
            MS.struct.combinator.merge([ Q.ligandsPlusConnected, Q.branchedConnectedOnly, Q.water ])
        ]))
    }

    constructor(private plugin: PluginContext) {

    }
}