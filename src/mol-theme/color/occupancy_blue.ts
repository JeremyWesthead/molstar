/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

 import { Color, ColorScale } from '../../mol-util/color';
 import { StructureElement, Unit, Bond, ElementIndex } from '../../mol-model/structure';
 import { Location } from '../../mol-model/location';
 import { ColorTheme } from '../color';
 import { ParamDefinition as PD } from '../../mol-util/param-definition';
 import { ThemeDataContext } from '../theme';
 
 const DefaultOccupancyColor = Color(0xCCCCCC);
 const Description = `Assigns a color based on the occupancy of an atom.`;
 
 export const OccupancyBlueColorThemeParams = {
     // Requiblue for the interface but does not actually effect colouring
     domain: PD.Interval([0, 1]),
     list: PD.ColorList('purples', { presetKind: 'scale' }),
 };
 export type OccupancyBlueColorThemeParams = typeof OccupancyBlueColorThemeParams
 export function getOccupancyBlueColorThemeParams(ctx: ThemeDataContext) {
     return OccupancyBlueColorThemeParams; // TODO return copy
 }
 
 function padHex(hex : string) : string{
    if(hex.length < 2){
        return padHex("0"+hex);
    }
    else{
        return hex;
    }
}
 
export function getColour(unit: Unit, element: ElementIndex): number {
    if (Unit.isAtomic(unit)) {
        const occupancy = unit.model.atomicConformation.occupancy.value(element);
        const hexStr = "0000" + padHex(Math.round(occupancy*255).toString(16));
        return parseInt(hexStr, 16);

    } else {
        return 0;
    }
}
 
 export function OccupancyBlueColorTheme(ctx: ThemeDataContext, props: PD.Values<OccupancyBlueColorThemeParams>): ColorTheme<OccupancyBlueColorThemeParams> {
     const scale = ColorScale.create({
         reverse: false,
         domain: props.domain,
         listOrName: props.list.colors,
     });
 
     function color(location: Location): Color {
         if (StructureElement.Location.is(location)) {
             return getColour(location.unit, location.element) as Color;
         } else if (Bond.isLocation(location)) {
             return getColour(location.aUnit, location.aUnit.elements[location.aIndex]) as Color;
         }
         return DefaultOccupancyColor;
     }
 
     return {
         factory: OccupancyBlueColorTheme,
         granularity: 'group',
         preferSmoothing: true,
         color,
         props,
         description: Description,
         legend: scale ? scale.legend : undefined
     };
 }
 
 export const OccupancyBlueColorThemeProvider: ColorTheme.Provider<OccupancyBlueColorThemeParams, 'occupancy-blue'> = {
     name: 'occupancy-blue',
     label: 'Occupancy-Blue',
     category: ColorTheme.Category.Atom,
     factory: OccupancyBlueColorTheme,
     getParams: getOccupancyBlueColorThemeParams,
     defaultValues: PD.getDefaultValues(OccupancyBlueColorThemeParams),
     isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && ctx.structure.models.some(m => m.atomicConformation.occupancy.isDefined)
 };