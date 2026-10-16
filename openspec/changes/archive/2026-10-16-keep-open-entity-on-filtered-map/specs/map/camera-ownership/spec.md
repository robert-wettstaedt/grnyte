# Spec Delta

## ADDED Requirements

### Requirement: A route's detail offers its block on the map

A route's detail SHALL offer a way to open the route's block on the map, where the block's detail
opens and the camera frames the block. It SHALL be offered only when the block has a location.
Returning to the previous history entry SHALL bring the reader back to the route's detail.

#### Scenario: Showing a route's block

- **WHEN** the reader is on a route's detail whose block has a location and asks for it to be shown
  on the map
- **THEN** the block's detail SHALL open over the map and the camera SHALL frame the block

#### Scenario: Back returns to the route

- **WHEN** the reader has shown a route's block on the map and goes back
- **THEN** the route's detail SHALL be shown again

#### Scenario: A block with no location offers nothing

- **WHEN** the reader is on a route's detail whose block has no location
- **THEN** no affordance to show it on the map SHALL be offered
