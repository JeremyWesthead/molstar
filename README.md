# Mol* Mutation
A fork of Mol* with changes to default colouring and camera options with the aim of visualising muations within a protein.
Defaults to hiding carbohydrates, colouring by an occupancy field within a PDB file, and changing camera options to make this more viewable.

## Installation
```
git clone git@github.com:JeremyWesthead/molstar-mutation.git
cd molstar-mutation
npm install
npm run build
```

## Documentation
A full README for Mol* can be found in the `molstar-README.md` file.
### Viewer
To create a viewer to view mutations within a protein:
1. Create a PDB file for the desired protein which has occupancy field values of `0` for all ATOM values. This is the `reference protein`
2. Create a PDB file for the desired protein which has an occupancy field which is determined by a normalised measure of mutation frequency for all ATOM values. If an ATOM's corresponding amino acid does not have any mutations (the normalised measure is 0), delete it from the PDB. This creates the `mutations pdb`
3. Create an HTML `div` with an `id` field. Add styling to this `div` using css in order to set the size and position of the viewer
4. Define an asynchronous function such as :
```
async function load_structure() {
    viewer.plugin.colour = <colour>;
    viewer.plugin.is_reference = false;
    await viewer.loadStructureFromUrl(<path to mutations pdb>, "pdb", false);
    viewer.plugin.is_reference = true;
    await viewer.loadStructureFromUrl(<path to reference protein>, "pdb", false);
}
```
Where `<colour>` is a value of `default`, `red`, `green`, `blue`. This controls the colour scheme used to colour the mutations.
5. Instanciate a `Viewer` object: `viewer = new molstar.Viewer(<div id>, {options...});` where `<div id>` is the `id` field of the `div` created in step 3.
6. Call the asynchonous function on window load.

### Colour schemes
Colour schemes for showing the mutation can be changed by changing the value of `viewer.plugin.colour`.
* `default` Gradient of black to pink to red.
    * 0.00 = rgb(0, 0, 0)
    * 0.50 = rgb(255, 0, 255)
    * 1.00 = rgb(255, 0, 0)
* `red` Gradient of black to red.
    * 0.00 = rgb(0, 0, 0)
    * 1.00 = rbg(255, 0, 0)
* `green` Gradient of black to green.
    * 0.00 = rgb(0, 0, 0)
    * 1.00 = rbg(0, 255, 0)
* `blue` Gradient of black to blue.
    * 0.00 = rgb(0, 0, 0)
    * 1.00 = rbg(0, 0, 255)
#### Adding colour schemes
To add a new colour scheme, it must be defined using typescript in a new file in `src/mol-theme/color`. See `src/mol-theme/color/occupancy-default.ts` and `src/mol-theme/color/occupancy.ts` for examples. 
To utilise a new colour scheme for mutations, `src/mol-plugin-state/builder/structure/representation-preset.ts`->`mutation` must also be edited to use this theme for a desired value of `plugin.colour` which can be accessed via `viewer.plugin.colour`.
