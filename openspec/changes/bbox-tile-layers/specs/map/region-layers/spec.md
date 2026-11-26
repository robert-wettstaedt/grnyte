# Spec Delta

## Purpose

Map overlays a region admin configures (relief services and similar), from the address an admin
enters to the layer every member of the region sees on the map.

## ADDED Requirements

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

- **WHEN** an admin opens the form of a region holding a template layer
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
