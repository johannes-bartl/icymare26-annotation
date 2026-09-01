# icymare26-annotation

A zero-install image annotation tool for the "Machine Learning & YOLO for wildlife data"
workshop at ICYMARE 2026. It is a static web page: **every image stays in your browser**,
nothing is uploaded, no account, no software to install.

## Use it

### 👉 [johannes-bartl.github.io/icymare26-annotation](https://johannes-bartl.github.io/icymare26-annotation/)

Drop a folder of images on it, create a marker type, draw markers, hit **Export**.
The page walks you through the first two steps.

## Run it locally

Just open `index.html` in a browser — there is no build step and no dependencies.

## Controls

The **Get help** button in the top bar lists all of this in the app itself.

| Action | How |
| --- | --- |
| Draw a marker | Left-drag on the image (click for Point markers) |
| Resize / move | Left-drag a handle — see below |
| Rotate | Drag the round handle above a rotatable marker (Shift snaps to 15°) |
| Pan | **Right-drag** (also middle-drag, or Space + drag) |
| Zoom | Mouse wheel · `+` / `−` · `F` fits the image |
| Turn the image 90° | `R` — **display only**, exported coordinates never change |
| Delete one marker | Hold **Ctrl** and click it (a bin appears beside the cursor), or the bin tool `X` |
| Select many | Select tool `V`, then drag a box · Shift+click adds · `Ctrl+A` selects all |
| Delete a selection | `Delete`, or the bin button in the top bar |
| Switch marker type | Its hotkey `1`–`0`, or click it in the Markers panel |
| Previous / next image | `,` and `.` or the arrow keys |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Lock existing markers | `L`, or the padlock in the top bar |
| Remove an image | The bin on its row in the Images panel, or `Del` once the row is focused |

Markers are drawn as **outlines with no fill**, and their handles appear on their own as
soon as the cursor comes near an edge — nothing has to be clicked or selected first.
A marker can never be dragged around by its middle, so the inside of a box stays free
canvas that you can draw another marker on. Boxes and ellipses are reshaped by their
eight handles, lines by their two endpoints, and a point is picked up and moved once you
hover close enough to it.

The sidebar switches between **Images** and **Marker types** with the two icons on the
far left. Drag its right edge to resize it; click the active icon to collapse it.

### Locking your work

The padlock in the top bar protects what you have already drawn. With it on, the annotate
tool only ever places **new** markers — handles do not appear and a stray drag across an
existing marker cannot reshape it. Hold `Shift` to edit one anyway, for as long as you hold
it. Useful once an image is mostly done and you are filling in the last few animals.

## Marker types

A marker type is one annotation class: a name, a colour, an optional hotkey, and a mode.

| Mode | Drawn by | Rotation |
| --- | --- | --- |
| Point | a single click | – |
| Rectangle | dragging corner to corner (Shift = square) | optional |
| Line | dragging end to end, or clicking one end then the other | – |
| Ellipse | dragging out its bounding box (Shift = circle) | optional |
| Polygon | clicking each vertex, then the first one to close | – |
| Pose | dragging a box, which fills with the type's skeleton | – |

Deleting a marker type also deletes every marker placed with it; the confirmation dialog
tells you how many.

### Lines

Drag from one end to the other, or **click once for each end**. The two-click form is the
easier one when the ends are far apart, since you can pan between the clicks. `Esc` abandons
a line still waiting for its far end.

### Polygons

**Click** to place a vertex, or **drag** to trace a whole run of them along the cursor —
clicks for corners, drags for curves, mixed freely in one shape. Close the ring by clicking
the first vertex again (`Enter` and double-click also close it, `Backspace` removes the last
vertex, `Esc` abandons the shape).

Afterwards:

- drag any vertex to move it
- hover an edge and click the **+** that appears to insert a vertex there, dragging it
  straight out to where you want it
- hold `Alt` — a bin follows the cursor and the vertex under it turns red; click to remove
  that one (a polygon keeps a minimum of three)

A traced polygon can carry dozens of vertices spaced about a handle-width apart, so only the
handles near the cursor are drawn — otherwise the outline disappears under its own dots. Every
vertex stays grabbable regardless.

### Poses

A pose type carries a **skeleton blueprint**: an ordered list of named keypoints, the bones
drawn between them, and which pairs mirror each other. Drag a box on the image and the whole
skeleton drops in pre-posed, so you adjust points rather than placing them from nothing.

- drag a keypoint to move it — that also marks it **confirmed**
- `Alt`+click a keypoint to cycle **visible → occluded → absent**
- points you have not touched are drawn hollow and faded, so an untouched template can
  never pass for a finished annotation
- resizing the box leaves the keypoints alone

#### Skeleton blueprints

Open the **Skeleton** editor from the marker type. On the pad:

- **click empty space** to add a keypoint
- **drag a point** to move it
- **click one point, then another** to connect or disconnect them

The selected point gets a blue halo and a dashed line follows the cursor, showing exactly what
the next click would join. Each new point chains onto the selected one, so drawing a limb is
one click per joint. `Esc` deselects.

**Start from** loads a preset — *Empty* to build from scratch, or quadruped, pinniped, bird,
fish, or COCO-17 human. Where you place the points *is* the template pose, so it is worth
arranging them roughly like a real animal.

In the list beside the pad you can rename each point, set its side, and **move it up or down
the order** with the arrows — bones and mirror pairs follow the point, so reordering never
rewires the skeleton.

**Mirror pairs** (the `↔` badges) record which keypoints swap when an image is flipped
horizontally. Training augments images by flipping them, so without these the model learns
left and right the wrong way round. **Auto-pair L/R** fills them in by matching `left_…` and
`right_…` names; they are exported as YOLO's `flip_idx`.

> The COCO-17 preset is the spec exactly: seventeen points and nineteen bones, with **no
> neck** — COCO does not define one. Add one with the editor if your model expects it.

**Import and export the blueprint as JSON.** In a workshop this matters more than it sounds:
if everyone defines their own skeleton you get mutually incompatible datasets. Hand out one
`*_skeleton.json` and have everyone load it.

The keypoint **order is the export index**, so once anything has been annotated with the type
the editor locks adding, deleting and reordering. Renaming, moving the template and changing
bones stay available, because none of those shift an index.

## Properties

While you draw or drag a marker — and whenever exactly one is selected — a readout above it
shows its geometry in absolute image pixels, the same numbers the export writes.

Each marker type in the sidebar has an arrow that opens **the markers placed with it**,
grouped by image. Clicking one jumps to its image, selects it and centres the view; selecting
a marker on the canvas opens its row in the sidebar. The selected marker's row expands into
number fields you can type into.

| Mode | Editable | Also shown |
| --- | --- | --- |
| Point | `x`, `y` | – |
| Rectangle | `x`, `y`, `w`, `h`, `angle` when rotatable | – |
| Ellipse | `x`, `y`, `w`, `h`, `angle` when rotatable | – |
| Line | `x1`, `y1`, `x2`, `y2` | length, bearing |
| Polygon | `x`, `y`, `w`, `h` of its box | vertex count, area |
| Pose | `x`, `y`, `w`, `h` of its box, then every keypoint's position and visibility | how many keypoints are confirmed |

`x, y` is always the **top-left corner**, never the centre, so typing a width grows the shape
rightwards rather than from the middle. A polygon has no size of its own, so editing its box
translates or scales every vertex together — handy for nudging a traced outline into place.

## Export

**Every drawing mode gets its own CSV**, carrying only the columns that mode needs:

| File | Contains |
| --- | --- |
| `points.csv` | every Point marker |
| `rectangles.csv` | every Rectangle marker |
| `ellipses.csv` | every Ellipse marker |
| `lines.csv` | every Line marker |
| `polygons.csv` | every Polygon marker |
| `poses.csv` | every Pose marker |
| `skeletons.json` | the blueprints, so they travel with the data |

Several marker types sharing a mode share the file — two rectangle types, `Seal` and `Bird`,
both land in `rectangles.csv` and are told apart by the `class_name` column.

Hover the **Export** button for a menu listing each file with its marker count and which
types are in it. Click one to download it on its own, or take everything at once: a single
file downloads directly, several arrive as a ZIP. Modes you never drew in are not offered.

All coordinates are **absolute image pixels**, origin at the top-left corner.

### `points.csv`, `rectangles.csv`, `ellipses.csv`, `lines.csv`

One row per marker.

Every file starts with `image_name, image_width, image_height, class_name`, then:

| Mode | Further columns |
| --- | --- |
| `point` | `x`, `y` — the point itself |
| `rect` | `x`, `y` = top-left corner, `w`, `h`, `angle_deg` |
| `ellipse` | `x`, `y` = top-left corner of its box, `w`, `h`, `angle_deg` |
| `line` | `x`, `y` = start, `x2`, `y2` = end |

For a rotated box or ellipse, `x`, `y`, `w`, `h` describe it **before** rotation and
`angle_deg` turns it about its centre — so the four numbers stay exact, and at
`angle_deg = 0` they are simply the axis-aligned bounding box.

### `polygons.csv`

**One row per vertex** — a variable number of vertices does not belong in a variable number
of columns, and this shape pivots in one line of pandas.

| Column | Meaning |
| --- | --- |
| `image_name`, `image_width`, `image_height` | the source image |
| `class_name` | the marker type's name |
| `instance_id` | 1-based, restarting on each image |
| `n_vertices`, `area_px` | repeated on every row of the polygon, for convenience |
| `vertex_index` | 0-based, in drawing order |
| `x`, `y` | the vertex |

### `poses.csv`

**One row per keypoint**, with the instance's box repeated. Wide format would break the
moment two skeletons have different keypoint counts.

| Column | Meaning |
| --- | --- |
| `image_name`, `image_width`, `image_height` | the source image |
| `class_name`, `instance_id` | which animal, 1-based per image |
| `box_x`, `box_y`, `box_w`, `box_h` | its bounding box, repeated on every row |
| `keypoint_index`, `keypoint_name` | position in the skeleton — the index is what YOLO uses |
| `x`, `y` | the keypoint, empty when it is absent |
| `visibility` | `2` visible · `1` labelled but occluded · `0` not present |

### `skeletons.json`

One entry per pose type, holding its blueprint plus `kpt_shape` and `flip_idx` ready for
ultralytics. `flip_idx` is the permutation that maps each keypoint to its mirror — without it,
horizontally-flipped training images teach the model that left flippers are right flippers.

## Notes

**Nothing is saved anywhere.** Marker types and annotations live only as long as the tab
does — reloading or closing it throws them away, and the browser will ask you to confirm
first. Export the CSV before you leave.
