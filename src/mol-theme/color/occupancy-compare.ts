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

 export const OccupancyCompareColorThemeParams = {
     // Required for the interface but does not actually effect colouring
     domain: PD.Interval([0, 1]),
     list: PD.ColorList('purples', { presetKind: 'set' }),
 };
 export type OccupancyCompareColorThemeParams = typeof OccupancyCompareColorThemeParams
 export function getOccupancyCompareColorThemeParams(ctx: ThemeDataContext) {
     return OccupancyCompareColorThemeParams; // TODO return copy
 }

 function padHex(hex : string) : string{
     if(hex.length < 2){
         return padHex("0"+hex);
     }
     else{
         return hex;
     }
 }
  
 export function getCompareColour(unit: Unit, element: ElementIndex): number {
     if (Unit.isAtomic(unit)) {
         // Get the occupancy from the pdb. Convert back to whole numbers so inverse cantor pairing function can be applied
         const occupancy = unit.model.atomicConformation.occupancy.value(element) * 100;
         // Inverse cantor function
         const w = Math.floor(((8 * occupancy + 1)**0.5 - 1) / 2)
         const t = w * (w + 1) / 2
         //Ensure values are positive
         const x = Math.max(Math.round(w - occupancy + t), 0);
         const y = Math.max(Math.round(occupancy - t), 0);
         // Convert to a single hex string. Values are mutliplied by 25 as this is equavalent of (x/10)*255
         // Dividing by 10 is required to convert to decimals back from the natural numbers required for cantor pairing
         // Uses rgb(mutation1, 0, mutation2) to provide colours
         const hexStr = padHex((x*25).toString(16))+"00"+padHex((y*25).toString(16));
         return parseInt(hexStr, 16);

     } else {
         return 0;
     }
 }
 
 export function OccupancyCompareColorTheme(ctx: ThemeDataContext, props: PD.Values<OccupancyCompareColorThemeParams>): ColorTheme<OccupancyCompareColorThemeParams> {
     const scale = ColorScale.create({
         reverse: false,
         domain: props.domain,
         listOrName: props.list.colors,
     });
 
     function color(location: Location): Color {
         if (StructureElement.Location.is(location)) {
             return getCompareColour(location.unit, location.element) as Color;
         } else if (Bond.isLocation(location)) {
             return getCompareColour(location.aUnit, location.aUnit.elements[location.aIndex]) as Color;
         }
         return DefaultOccupancyColor;
     }
 
     return {
         factory: OccupancyCompareColorTheme,
         granularity: 'group',
         preferSmoothing: true,
         color,
         props,
         description: Description,
         legend: scale ? scale.legend : undefined
     };
 }
 
 export const OccupancyCompareColorThemeProvider: ColorTheme.Provider<OccupancyCompareColorThemeParams, 'occupancy-compare'> = {
     name: 'occupancy-compare',
     label: 'Occupancy-Compare',
     category: ColorTheme.Category.Atom,
     factory: OccupancyCompareColorTheme,
     getParams: getOccupancyCompareColorThemeParams,
     defaultValues: PD.getDefaultValues(OccupancyCompareColorThemeParams),
     isApplicable: (ctx: ThemeDataContext) => !!ctx.structure && ctx.structure.models.some(m => m.atomicConformation.occupancy.isDefined)
 };