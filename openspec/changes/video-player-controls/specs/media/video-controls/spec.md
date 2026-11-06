# Spec Delta

## Purpose

How the media viewer's controls show and hide so a reader can see the whole frame, and how a reader
controls video playback there, including on the public share page.

## ADDED Requirements

### Requirement: A tap on the media toggles the controls

On touch, a tap on the media SHALL toggle the controls and SHALL NOT change playback. Revealing SHALL
be immediate. Hiding SHALL wait about 250 ms so that a second tap can cancel it.

#### Scenario: Tap while controls are visible

- **WHEN** a reader taps a playing video while its controls are visible
- **THEN** the controls hide after about 250 ms and the video keeps playing

#### Scenario: Tap while controls are hidden

- **WHEN** a reader taps a playing video while its controls are hidden
- **THEN** the controls appear immediately and the video keeps playing

#### Scenario: Double-tap to zoom

- **WHEN** a reader double-taps the media within the cancel window while its controls are visible
- **THEN** the media zooms and the controls stay visible

#### Scenario: A drag is not a tap

- **WHEN** a reader swipes to page or dismiss, or pans a zoomed video
- **THEN** the controls do not toggle

### Requirement: A mouse keeps click to play and reveals on movement

With a mouse, a click on a video SHALL play or pause it, and moving the mouse SHALL reveal the
controls. The cursor SHALL hide over a video while its controls are hidden.

#### Scenario: Click on a playing video

- **WHEN** a reader clicks a playing video with a mouse
- **THEN** the video pauses and its controls are visible

#### Scenario: Moving the mouse

- **WHEN** a reader moves the mouse while a playing video's controls are hidden
- **THEN** the controls and the cursor appear

### Requirement: Controls hide after 3 seconds of actual playback

While a video is actually playing, its controls SHALL hide 3 seconds after the last interaction. The
timer SHALL NOT run while the video is paused, ended, buffering or waiting to start.

#### Scenario: Left alone during playback

- **WHEN** a video plays for 3 seconds with no interaction
- **THEN** its controls hide

#### Scenario: Interaction restarts the wait

- **WHEN** a reader presses a control while a video is playing
- **THEN** the controls stay visible for another 3 seconds

#### Scenario: Slow start

- **WHEN** a video takes 10 seconds to start after the viewer opens
- **THEN** its controls stay visible until 3 seconds after playback actually begins

### Requirement: A paused video does not auto-hide its controls

A paused or ended video SHALL NOT hide its controls on a timer, and on touch a tap SHALL still hide
them. Once hidden by a tap, they SHALL stay hidden until the next tap or other reveal.

#### Scenario: Pausing

- **WHEN** a reader pauses a video and waits
- **THEN** the controls stay visible

#### Scenario: A clean paused frame

- **WHEN** a reader taps a paused video while its controls are visible
- **THEN** the controls hide and stay hidden, and the video stays paused

### Requirement: Controls stay visible while in use

Controls SHALL NOT auto-hide while a reader is scrubbing, while a mouse pointer is over them, while
keyboard focus is inside them, or while a sheet or dialog opened from them is open.

#### Scenario: Scrubbing

- **WHEN** a reader holds the seek bar for longer than 3 seconds
- **THEN** the controls stay visible until 3 seconds after release

#### Scenario: Sheet open

- **WHEN** the share, source, speed, ascent details or delete sheet is open over a playing video
- **THEN** the controls stay visible until 3 seconds after it closes

#### Scenario: A tap while a sheet is open

- **WHEN** a reader taps or clicks the media to dismiss an open sheet
- **THEN** the controls stay visible and playback does not change, even though a popover closes before the click arrives

#### Scenario: Touch focus does not hold them

- **WHEN** a reader taps the mute button on a touch screen and the button keeps focus
- **THEN** the controls still hide after 3 seconds

### Requirement: Hiding covers all viewer controls

Hiding SHALL cover the toolbar, the caption, the playback controls and the desktop paging arrows, and
they SHALL fade rather than snap, without motion when the reader prefers reduced motion. The logo on
the public share page SHALL stay visible.

#### Scenario: Viewer controls hide

- **WHEN** controls hide in the in-app viewer
- **THEN** the toolbar, caption, playback controls and arrows are all out of view

#### Scenario: Share page controls hide

- **WHEN** controls hide on the share page
- **THEN** its toolbar, caption and playback controls are out of view and its logo remains

#### Scenario: Reduced motion

- **WHEN** a reader who prefers reduced motion toggles the controls
- **THEN** they appear and disappear with no animation

### Requirement: Hidden controls cannot be pressed by accident

A pointer press where a hidden control sits SHALL act as a press on the media and SHALL NOT activate
that control.

#### Scenario: Tap where delete sits

- **WHEN** controls are hidden and a reader taps where the delete button would be
- **THEN** the controls appear, and no delete confirmation opens

### Requirement: Hidden controls stay reachable by keyboard

Hidden controls SHALL stay in the tab order, and keyboard focus reaching one SHALL reveal the
controls, so a keyboard or screen reader user can operate them.

#### Scenario: Tabbing to a hidden control

- **WHEN** controls are hidden and a reader presses Tab
- **THEN** the controls appear with visible focus on a control, and they stay visible while focus is inside them

### Requirement: Paging brings the controls back

Moving to another item SHALL show the controls for that item, whatever their state on the previous
one. If the new item is a video, the 3 second wait starts when it plays.

#### Scenario: Swiping on from hidden controls

- **WHEN** a reader swipes to the next video while controls are hidden
- **THEN** the next video's caption and controls are visible, and hide 3 seconds after it starts playing

### Requirement: Photos toggle on a tap with no timer

A press on a photo SHALL toggle the viewer's controls, with touch or a mouse, and they SHALL NOT hide
on a timer. Moving the mouse over a photo SHALL NOT reveal them.

#### Scenario: Tap on a photo

- **WHEN** a reader taps a photo while its controls are visible
- **THEN** the controls hide after about 250 ms and stay hidden until the next tap

#### Scenario: Photo left alone

- **WHEN** a reader leaves a photo open with controls visible
- **THEN** the controls stay visible

#### Scenario: Mouse on a photo

- **WHEN** a reader has hidden a photo's controls with a click and moves the mouse
- **THEN** the controls stay hidden until the next click

### Requirement: Controls stay visible when there is nothing to hide them for

Controls SHALL stay visible, and a press SHALL NOT hide them, while a video is being prepared, is
unavailable, or has dropped to the host's embedded player.

#### Scenario: Embedded player fallback

- **WHEN** a video has dropped to the embedded player
- **THEN** the toolbar and paging arrows stay visible

#### Scenario: Preparing video

- **WHEN** a reader opens a video that is still being prepared
- **THEN** the toolbar and caption stay visible

### Requirement: Playback controls are laid out in two rows

Playback controls SHALL show the seek bar with both times on one row, above a row of buttons, at every
viewport width. Stepping controls SHALL appear only while the video is paused.

#### Scenario: Narrow screen

- **WHEN** a reader views a video at 375 px wide
- **THEN** the seek bar spans the row, and play, mute and speed are all reachable below it

### Requirement: A reader can change playback speed

A reader SHALL be able to choose 0.25x, 0.5x, 0.75x, 1x, 1.5x or 2x from a picker, and the control
SHALL show the current speed. Every video SHALL start at 1x.

#### Scenario: Choosing a speed

- **WHEN** a reader picks 0.5x
- **THEN** the video plays at half speed, the picker closes, and the control reads 0.5x

#### Scenario: Paging resets speed

- **WHEN** a reader pages to another video after choosing 0.5x
- **THEN** the new video plays at 1x

### Requirement: A reader can step a paused video

While a video is paused, a reader SHALL be able to step it back or forward by about 1/30 of a second.
The step is approximate, and the system SHALL NOT present it as exact.

#### Scenario: Stepping forward

- **WHEN** a reader presses step forward on a paused video
- **THEN** the video stays paused about 1/30 of a second later

#### Scenario: Stepping at the start

- **WHEN** a reader presses step back at 0:00
- **THEN** the position stays at 0:00

### Requirement: An ended video offers Repeat

When a video ends, the system SHALL show its controls with a Repeat button in the center of the
video, and SHALL NOT loop or restart on its own. Repeat is part of the controls, so a tap hides it too.

#### Scenario: Video ends

- **WHEN** a video reaches its end
- **THEN** it stops, and the controls and a Repeat button are visible, even if they were hidden

#### Scenario: Pressing Repeat

- **WHEN** a reader presses Repeat
- **THEN** the video plays from 0:00 with its current sound and speed

#### Scenario: Studying the last frame

- **WHEN** a reader taps an ended video while its controls are visible
- **THEN** the controls and Repeat hide, and the next tap brings them back

#### Scenario: Dragging a paused video to the end

- **WHEN** a reader drags the seek bar of a paused video all the way to the end
- **THEN** the last frame shows, Repeat is offered, and pressing it plays from 0:00

#### Scenario: Seeking back from the end

- **WHEN** a reader seeks back from the end of a video
- **THEN** Repeat disappears and the video stays paused at the new position

### Requirement: Sound is remembered until the page reloads

A reader's mute or unmute choice SHALL apply to later videos until the page reloads. Videos SHALL
start muted before any such choice. If the browser refuses to play with sound, the video SHALL play
muted, show as muted, and the choice SHALL be kept.

#### Scenario: Paging after unmuting

- **WHEN** a reader unmutes a video and pages to another
- **THEN** the new video plays with sound where the browser allows it

#### Scenario: Browser refuses sound

- **WHEN** a reader has unmuted and the browser refuses to autoplay the next video with sound
- **THEN** that video plays muted and its mute button shows it as muted

#### Scenario: Reloading

- **WHEN** a reader reloads the page and opens a video
- **THEN** it starts muted

### Requirement: Keyboard shortcuts control playback

On a video, Space or `k` SHALL play or pause, `m` SHALL mute, left and right arrows SHALL seek 5
seconds, `,` and `.` SHALL step while paused, and `<` and `>` SHALL change speed, stopping at 0.25x
and 2x. A shortcut SHALL reveal the controls. `j` and `l` keep paging.

#### Scenario: Space with nothing focused

- **WHEN** a reader presses Space with no control focused
- **THEN** the video plays or pauses and the controls appear

#### Scenario: Space after the controls hid

- **WHEN** a reader pressed a button with the mouse, the controls hid, and the reader presses Space
- **THEN** playback toggles, and the button they can no longer see does not activate

#### Scenario: Holding a toggle key

- **WHEN** a reader holds `k`
- **THEN** playback toggles once

#### Scenario: Space on a focused button

- **WHEN** a reader presses Space with a button focused
- **THEN** that button activates and playback does not also toggle

#### Scenario: Typing

- **WHEN** a reader types in a field in a sheet opened from the viewer
- **THEN** no shortcut fires

#### Scenario: Speed at its limit

- **WHEN** a reader presses `>` at 2x
- **THEN** the speed stays at 2x

### Requirement: Closing the viewer never leaves an invisible player

Closing the viewer SHALL normally land on an entry with no file named, however many file entries are behind it. If
a close still lands on a file entry, the viewer SHALL show that file visibly, except after a swipe: only Delete
closes the dialog ahead of the navigation that unmounts it. An earlier file entry stays reachable by going back, and
it shows the viewer. A second close while the first is on its way SHALL NOT move any further back.

#### Scenario: A second file entry behind the viewer

- **WHEN** a reader follows a link to another file with the viewer open, then closes it
- **THEN** the screen shows with no `?media` in its URL and no video mounted

#### Scenario: Pressing close twice

- **WHEN** a reader presses close twice before the first close has landed
- **THEN** only the screen the viewer was opened on shows, not the one before it

#### Scenario: Closing after arriving from another screen

- **WHEN** a reader opened the viewer from a notification on another screen, then closes it
- **THEN** that other screen shows

### Requirement: Viewer buttons name themselves and their shortcuts

On a hover-capable device, hovering or keyboard-focusing a viewer button SHALL show a tooltip with its name and, where it has one, its shortcut. Every button with a shortcut SHALL expose it to assistive technology. The seek bar SHALL have no tooltip, because it would cover the bar during a drag.

#### Scenario: Hovering mute

- **WHEN** a reader hovers the mute button with a mouse
- **THEN** a tooltip shows its name and the `M` key

#### Scenario: Tabbing to a button

- **WHEN** a reader tabs to the play button
- **THEN** a tooltip shows its name and the `K` key

#### Scenario: Screen reader

- **WHEN** a screen reader reaches the step forward button
- **THEN** the button exposes `.` as its keyboard shortcut

#### Scenario: Pressing a sheet's button

- **WHEN** a reader hovers the speed button and presses it
- **THEN** the picker opens and anchors to the button as before

### Requirement: A buffering video shows a spinner

A video that is waiting for data SHALL show a spinner over the media after about 250 ms, whether or
not its controls are visible, and SHALL NOT reveal the controls for it.

#### Scenario: Stall with hidden controls

- **WHEN** a playing video stalls for a second while its controls are hidden
- **THEN** a spinner appears, the controls stay hidden, and the spinner goes when playback resumes

#### Scenario: Short stall

- **WHEN** a video stalls for less than 250 ms
- **THEN** no spinner appears

### Requirement: A video shows its poster while it loads

A video SHALL show its poster until its first frame is ready. A poster that does not exist yet SHALL
leave the plain black stage and SHALL NOT show a broken image.

#### Scenario: Opening a video

- **WHEN** a reader opens a video on a slow connection
- **THEN** its poster shows until playback begins

### Requirement: Controls clear the device's safe areas

The toolbar and playback controls SHALL stay clear of display cutouts and system bars where the device
reports them, in the viewer and on the share page.

#### Scenario: Device with a bottom inset

- **WHEN** a device reports a bottom inset
- **THEN** the buttons sit above it and are fully pressable
