# region-layers Specification

## Purpose

Map overlays a region admin configures (relief services and similar), from the address an admin
enters to the layer every member of the region sees on the map.

## Requirements

### Requirement: An admin enters a layer as one address

The map-layers form SHALL accept, in its one address field, a WMS address with `LAYERS` (stored as a
WMS layer as before) or an https address containing `{bbox-epsg-3857}` (stored unchanged as a
template layer), and SHALL refuse any other address with an error naming both forms.

#### Scenario: A WMS address is stored as before

- **WHEN** an admin saves a layer with an address that has `LAYERS` and no `{bbox-epsg-3857}`
- **THEN** the layer is stored as a WMS layer with the endpoint and its parameters

#### Scenario: A bounding-box address is stored as a template

- **WHEN** an admin saves a layer with
  `https://service.example/export?bbox={bbox-epsg-3857}&bboxSR=3857&size=256,256&f=image`
- **THEN** the layer is stored as a template layer with exactly that address

#### Scenario: An address with neither form is refused

- **WHEN** an admin saves a layer whose address has no `LAYERS` and no `{bbox-epsg-3857}`, or uses
  plain http with the placeholder
- **THEN** the form shows the address error and nothing is saved

#### Scenario: Editing shows the address that was saved

- **WHEN** an admin opens the page of a template layer
- **THEN** the address field shows the stored template address unchanged

### Requirement: The map requests template layers by bounding box

The map SHALL draw a template layer as 256 pixel tiles in EPSG:3857, requesting each tile from the
stored address with every `{bbox-epsg-3857}` replaced by that tile's bounding box as
`minX,minY,maxX,maxY` in metres. A template layer SHALL use the layer's name, opacity, minimum zoom
and credits like a WMS layer, and SHALL get its own row in the layer switcher.

#### Scenario: A tile's address carries its bounding box

- **WHEN** the map needs the zoom 1 tile at column 0, row 0 of a template layer
- **THEN** it requests the address with `{bbox-epsg-3857}` replaced by
  `-20037508.342789244,0,0,20037508.342789244`

#### Scenario: Template and WMS layers show side by side

- **WHEN** a user belongs to one region with a WMS layer and one with a template layer
- **THEN** both draw on the map and both appear as rows in the layer switcher

### Requirement: A layer can stop at a maximum zoom

An admin MAY set a maximum zoom (a whole number 0 to 28) on any layer; closer in, the map SHALL
enlarge that zoom's tiles instead of requesting deeper ones. An uncapped layer SHALL be stored and
fingerprinted as before; a stored cap out of range SHALL drop only its layer; merged duplicates SHALL
take the lowest cap any region sets.

#### Scenario: A capped layer stops requesting deeper tiles

- **WHEN** a layer has maximum zoom 15 and the map is at zoom 17
- **THEN** the map shows that layer's zoom 15 tiles enlarged and requests no zoom 16 or 17 tiles

#### Scenario: An uncapped layer is unchanged

- **WHEN** an admin saves a layer with the maximum zoom field empty
- **THEN** the stored layer carries no maximum zoom key and its save fingerprint is unchanged

#### Scenario: The cap sits behind its symptom

- **WHEN** an admin opens a layer's page
- **THEN** the maximum zoom field sits in a section titled after the placeholder it fixes, closed
  unless the layer has a cap stored

### Requirement: The same template layer in several regions draws once

Template layers whose stored addresses are identical SHALL be treated as one layer for a user who
belongs to several regions holding it, merged the same way WMS layers are, and SHALL stay a template
layer after merging.

#### Scenario: Two regions hold the same template address

- **WHEN** a user belongs to two regions that both hold a template layer with the same address
- **THEN** the map draws it once, as a template layer

### Requirement: Older app versions never delete a template layer

A template layer SHALL be stored in the region settings without changing the shape of existing WMS
layers. An app version that does not know template layers SHALL skip them when drawing and SHALL
refuse to save that region's map layers, rather than save the list without them.

#### Scenario: A saved template survives a read by the same version

- **WHEN** an admin saves a region holding a template layer and reopens its map layers
- **THEN** the template layer reads back identical and the region's layers can be saved again

#### Scenario: A stale save is still refused

- **WHEN** an admin saves map layers after another admin changed them since the form loaded
- **THEN** the save is refused as stale, whether or not the layers include template layers

### Requirement: A layer's coverage limits its tile requests

A layer MAY store its coverage as a rectangle `[west, south, east, north]` in degrees, and the map
SHALL request no tiles of that layer outside it. A layer without coverage SHALL be stored as before
and requested everywhere. An invalid stored coverage SHALL drop only its layer. Merged duplicates
SHALL cover the union of their rectangles, or everywhere when any has none.

#### Scenario: An invalid coverage drops only its layer

- **WHEN** a stored coverage has west not below east, south not below north, a longitude beyond 180,
  a latitude beyond 85.0511, or not exactly four numbers
- **THEN** that layer is skipped and the region's other layers still draw

#### Scenario: No tiles outside the coverage

- **WHEN** a layer covers `10.08, 46.62, 13.03, 47.78` and the map shows only ground north of 48
- **THEN** the map requests no tiles of that layer

#### Scenario: A layer without coverage is unchanged

- **WHEN** an admin saves a layer whose service gives no coverage and leaves the coverage field empty
- **THEN** the stored layer carries no coverage key and its save fingerprint is unchanged

#### Scenario: Merging keeps every duplicate's ground

- **WHEN** two regions hold the same layer, one with coverage and one without
- **THEN** the merged layer has no coverage and is requested everywhere

### Requirement: Coverage is read from the service

On a layer's page, the app SHALL read the coverage from the service when the page opens and when
the address changes, and show it read-only with its outline on the preview: for WMS from the
capabilities, for an ArcGIS `MapServer/export` or `ImageServer/exportImage` template from the
service's extent. When the service gives none, the page SHALL say so and offer a
`west, south, east, north` field. The map itself SHALL never read capabilities.

#### Scenario: A world-wide box is clamped

- **WHEN** the service declares the layer's latitudes as -90 to 90
- **THEN** the coverage uses -85.0511 to 85.0511 and the layer saves

#### Scenario: The form refuses what the map would drop

- **WHEN** an admin types a coverage with west not below east, or a latitude beyond 85.0511
- **THEN** the field shows an error and nothing is saved

#### Scenario: Several WMS layers join into one rectangle

- **WHEN** the address names two layers in `LAYERS`, one without its own geographic box
- **THEN** that one takes its parent layer's box, and the coverage is the rectangle around both

#### Scenario: A WMS layer's coverage comes from its capabilities

- **WHEN** an admin pastes the Tirol relief WMS address
- **THEN** the coverage shows about `10.08, 46.62, 13.03, 47.78` without typing, and no coverage
  field is offered

#### Scenario: An unknown service needs typed coverage

- **WHEN** an admin pastes a template address that is not an ArcGIS export, or the service does not
  answer
- **THEN** the page says the service gives no coverage and shows the coverage field

#### Scenario: A new address never keeps the old coverage

- **WHEN** an admin changes a covered layer's address to a service that gives no coverage and saves
- **THEN** the stored layer has no coverage, or the one the admin typed, never the old rectangle

#### Scenario: Opening an existing layer fills its coverage

- **WHEN** an admin opens a stored layer that has no coverage, the service gives one, and the admin
  saves
- **THEN** the stored layer carries the service's coverage

### Requirement: The map-layers page lists the layers

`/regions/[id]/map-layers` SHALL show one row per stored layer in stored order, each with an image
of the layer's whole coverage (one image request), its name, a WMS or Template badge and the zoom it
shows from. A layer without coverage SHALL show a neutral placeholder instead of the image. A row
SHALL open that layer's page; "Add layer" SHALL open `/regions/[id]/map-layers/add`.

#### Scenario: Rows show what each layer draws

- **WHEN** an admin opens the map layers of a region with a Tirol layer that has coverage and an
  Oberösterreich layer without
- **THEN** the Tirol row shows an image of its relief and the Oberösterreich row shows the
  placeholder

### Requirement: Each layer has its own page

A layer's page SHALL be `/regions/[id]/map-layers/<segment>`, the segment a short hash of the
layer's address and parameters, holding one form for that layer. Saving SHALL send the region's
whole list with only this layer changed, added or removed, guarded by the fingerprint of the list
the page loaded, and SHALL return to the list.

#### Scenario: Saving one layer keeps the others

- **WHEN** an admin changes the opacity of one of six layers and saves
- **THEN** the region stores six layers, the other five unchanged, and the list page shows

#### Scenario: Another layer's invalid value is named

- **WHEN** another stored layer of the region holds a value the form refuses, such as a two-letter
  name
- **THEN** the page names that layer with a link to its page, and the save is refused

#### Scenario: An address already in the region is refused

- **WHEN** an admin enters an address and parameters that another layer of the region already has
- **THEN** the address field shows an error and nothing is saved

#### Scenario: An old segment finds nothing

- **WHEN** an admin opens a saved link to a layer that was since removed or got a new address
- **THEN** the page says the layer was not found and links back to the list

### Requirement: The layer's page previews it live

A layer's page SHALL show a map with only that layer over the base map, redrawn about half a second
after its address, opacity, zooms or coverage stop changing. It SHALL frame the coverage, else the
region's located blocks, else the map's default view, and draw the layer at every zoom.

#### Scenario: The preview shows the layer at state scale

- **WHEN** a layer that shows from zoom 14 is previewed framed on its whole coverage
- **THEN** the preview draws its relief, though the map would hide it at that zoom

#### Scenario: The preview follows an edit

- **WHEN** an admin changes the opacity from 1 to 0.5
- **THEN** shortly after, the preview draws the layer at half strength, before anything is saved

### Requirement: Removing a layer asks first and saves at once

"Remove layer" on a layer's page SHALL ask for confirmation. Confirming SHALL save the list without
that layer straight away, discarding unsaved edits on the page, and return to the list.

#### Scenario: Remove after confirming

- **WHEN** an admin presses "Remove layer" and confirms
- **THEN** the region stores the list without the layer, every other layer unchanged, and the list
  page shows

#### Scenario: Cancel keeps everything

- **WHEN** an admin presses "Remove layer" and cancels
- **THEN** nothing is saved and the page keeps its unsaved edits
