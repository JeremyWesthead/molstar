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
 
 const DefaultOccupancyDefaultColor = Color(0xCCCCCC);
 const Description = `Assigns a color based on the occupancy of an atom.`;
 
 export const OccupancyDefaultColorThemeParams = {
     domain: PD.Interval([0, 1]),
     list: PD.ColorList('purples', { presetKind: 'scale' }),
 };
 export type OccupancyDefaultColorThemeParams = typeof OccupancyDefaultColorThemeParams
 export function getOccupancyDefaultColorThemeParams(ctx: ThemeDataContext) {
     return OccupancyDefaultColorThemeParams; // TODO return copy
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
         const hexStr = padHex((Math.min(Math.round(occupancy)*2, 1)*255).toString(16)) + "00" + padHex(Math.round((-4*occupancy*occupancy + 4*occupancy)*255).toString(16));
         return parseInt(hexStr, 16);
 
     } else {
         return 0;
     }
 }
 
 export function OccupancyDefaultColorTheme(ctx: ThemeDataContext, props: PD.Values<OccupancyDefaultColorThemeParams>): ColorTheme<OccupancyDefaultColorThemeParams> {
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
         return DefaultOccupancyDefaultColor;
     }
 
     return {
         factory: OccupancyDefaultColorTheme,
         granularity: 'group',
         preferSmoothing: true,
         color,
         props,
         description: Description,
         legend: scale ? scale.legend : undefined
     };
 }
 
 export const OccupancyDefaultColorThemeProvider: ColorTheme.Provider<OccupancyDefaultColorThemeParams, 'occupancy-default'> = {
     name: 'occupancy-default',
     label: 'Occupancy-Default',
     category: ColorTheme.Category.Atom,
     factory: OccupancyDefaultColorTheme,
     getParams: getOccupancyDefaultColorThemeParams,
     defaultValues: PD.getDefaultValues(OccupancyDefaultColorThemeParams),
     isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && ctx.structure.models.some(m => m.atomicConformation.occupancy.isDefined)
 };