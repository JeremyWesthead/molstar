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
 
 export const OccupancyRedColorThemeParams = {
     // Required for the interface but does not actually effect colouring
     domain: PD.Interval([0, 1]),
     list: PD.ColorList('purples', { presetKind: 'scale' }),
 };
 export type OccupancyRedColorThemeParams = typeof OccupancyRedColorThemeParams
 export function getOccupancyRedColorThemeParams(ctx: ThemeDataContext) {
     return OccupancyRedColorThemeParams; // TODO return copy
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
        const hexStr = padHex(Math.round(occupancy*255).toString(16))+"0000";
        return parseInt(hexStr, 16);

    } else {
        return 0;
    }
}
 
 export function OccupancyRedColorTheme(ctx: ThemeDataContext, props: PD.Values<OccupancyRedColorThemeParams>): ColorTheme<OccupancyRedColorThemeParams> {
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
         factory: OccupancyRedColorTheme,
         granularity: 'group',
         preferSmoothing: true,
         color,
         props,
         description: Description,
         legend: scale ? scale.legend : undefined
     };
 }
 
 export const OccupancyRedColorThemeProvider: ColorTheme.Provider<OccupancyRedColorThemeParams, 'occupancy-red'> = {
     name: 'occupancy-red',
     label: 'Occupancy-Red',
     category: ColorTheme.Category.Atom,
     factory: OccupancyRedColorTheme,
     getParams: getOccupancyRedColorThemeParams,
     defaultValues: PD.getDefaultValues(OccupancyRedColorThemeParams),
     isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && ctx.structure.models.some(m => m.atomicConformation.occupancy.isDefined)
 };