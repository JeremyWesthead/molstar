# Changes to adapt to mutation viewing
There were a few changes which needed to be made to the defaults. These included custom colour themes, changes to showing panels and camera angles.

## Main changes by file

### src/mol-canvas-3d/passes/postprocessing.ts
Turn off occlusion by default
### src/mol-plugin-ui/structure/components.tsx
Hide carbohydrates by default
### src/apps/viewer/index.ts
Hide the right panel
### src/mol-plugin-ui/viewport.tsx
Hide the left panel
### src/mol-repr/structure/representation/cartoon.ts
Default cartoon representation to colour by occupancy
### src/mol-state/object.ts
When giving an object a label, check for (and appropriately truncate) a URL name.
### src/mol-canvas3d/canvas3d.ts
Default camera to use othographic rather than perspective
### src/mol-plugin-state/builder/structure/representation-preset.ts
Added custom representation presets for mutations and comparisons.
#### `auto` preset
Changed to automatically select mutation/comparison presets according to flags which can be set in the `viewer.plugin`
#### `mutation` preset
Preset used to provide a spacefill representation of mutations, coloured according to the value of the occupancy field for each residue, and a colour scheme, named by a variable in `viewer.plugin`.
#### `mutation_compare` preset
Preset used to provide a spacefill representation of mutations, using the inverse cantor pairing function on the occupancy values to determine colour within a 2D gradient.
### src/mol-theme/color/occupancy-compare.ts
Custom theme which applies the inverse cantor pairing function to the occupancy value, and utilises these values to change the R and B values within the RGB values for colouring each residue. This results in a 2D gradient:
* (0,0) -> rgb(0,0,0)
* (1,0) -> rgb(250,0,0)
* (0,1) -> rgb(0,0,250)
* (1,1) -> rgb(250,0,250)
Set if `viewer.plugin.is_comparison === true`
### src/mol-theme/color/occupancy.ts
Custom theme which utilises the occupancy value to produce a gradient of colour as the occupancy increases:
* 0.00 -> rgb(0,0,0)
* 0.50 -> rgb(255,0,255)
* 1.00 -> rgb(255, 0, 0)
Set if `viewer.plugin.colour === 'default'`
### src/mol-theme/color/occupancy_red.ts
Custom theme which utilises the occupancy value to produce a gradient of black->red as occupancy 0->1
Set if `viewer.plugin.colour === 'red'`
### src/mol-theme/color/occupancy_green.ts
Custom theme which utilises the occupancy value to produce a gradient of black->green as occupancy 0->1
Set if `viewer.plugin.colour === 'blue'`
### src/mol-theme/color/occupancy_blue.ts
Custom theme which utilises the occupancy value to produce a gradient of black->blue as occupancy 0->1
Set if `viewer.plugin.colour === 'green'`
### src/mol-theme/color.ts
Added custom colour themes to be valid colour themes.
### src/mol-theme/label.ts
Changes the onhover label for each residue to describe relative mutation rather than occupancy. Also allows use of a global toggle (`window.is_comparison`) to change the label to show both relative mutation values of a comparison by applying the inverse cantor pairing function to the occupancy. Also removes some less helpful label features to make it easier to understand.
