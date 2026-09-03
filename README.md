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

Each marker type in the sidebar has an arrow that opens **the markers placed with it**,
grouped by image. Clicking one jumps to its image, selects it and centres the view; selecting
a marker on the canvas opens its row in the sidebar. The selected marker's row expands into
number fields you can type into, in absolute image pixels — the same numbers the export
writes.

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

Geometry follows the layouts **YOLO** uses for each task, so a row maps onto a label line
without rearranging anything:

| Task | Line format |
| --- | --- |
| Detect | `cls xc yc w h` |
| OBB | `cls x1 y1 x2 y2 x3 y3 x4 y4` |
| Segment | `cls x1 y1 x2 y2 ... xn yn` |
| Pose 2D | `cls xc yc w h px1 py1 px2 py2 ...` |
| Pose 3D | `cls xc yc w h px1 py1 v1 px2 py2 v2 ...` |

Every file starts with `image_name, image_width, image_height, class_name`, then:

| File | Written for | Geometry columns |
| --- | --- | --- |
| `points.csv` | Point markers | `x, y` |
| `lines.csv` | Line markers | `x1, y1, x2, y2` |
| `rectangles.csv` | Rectangles without rotation | `xc, yc, w, h` |
| `rectangles_obb.csv` | Rectangles **with** rotation | `x1 … y4`, four corners clockwise from top-left |
| `ellipses.csv` | Ellipses without rotation | `xc, yc, w, h` |
| `ellipses_obb.csv` | Ellipses **with** rotation | `x1 … y4` |
| `polygons.csv` | Polygons | `n_vertices`, then `x1, y1 … xn, yn` |
| `poses.csv` | Pose types without visibility | `xc, yc, w, h, n_keypoints`, then `px1, py1 …` |
| `poses_3d.csv` | Pose types **with** visibility | `xc, yc, w, h, n_keypoints`, then `px1, py1, v1 …` |
| `skeletons.json` | any pose type | blueprints, `kpt_shape` and `flip_idx` |

Turning rotation on for a rectangle or ellipse changes its encoding, so it changes its file:
`xc, yc, w, h` cannot carry an angle, and an oriented box is what YOLO's OBB task expects.
Ticking **Record visibility** on a pose type moves it from `poses.csv` to `poses_3d.csv` and
sets its `kpt_shape` to `[n, 3]` instead of `[n, 2]`.

Polygons and poses vary in length, so rows are padded out to the widest one in that file;
`n_vertices` and `n_keypoints` say where the real values stop.

> **Coordinates are absolute image pixels, not normalised.** `image_width` and `image_height`
> sit on every row, so dividing through to get YOLO's 0–1 range is one step — while recovering
> pixels from normalised values without those columns is impossible.

Several marker types sharing an encoding share the file, told apart by `class_name`.

Hover the **Export** button for a menu listing each file with its marker count and which
types are in it. Click one to download it on its own, or take everything at once: a single
file downloads directly, several arrive as a ZIP.

## Inspect: loading annotations back in

The third icon on the far left opens **Inspect**, where you load annotation CSVs and see them
drawn on your images. Predictions from a model, a colleague's labels, or an export from an
earlier session all read the same way.

- **load the images first**, then the CSVs - rows are matched to images by filename
- one file may cover any number of images, and any number of files may be loaded
- each class becomes a marker type with a colour picked for it; click its chip to change the
  colour, or anything else about it
- a class that matches an existing type by **name and encoding** reuses that type rather than
  making a duplicate - a `Seal` box and a `Seal` pose stay separate, because they are
- removing a file removes exactly the annotations it brought, and any type it invented that
  is now empty; nothing you drew yourself is touched

Imported annotations behave like any other marker: editable, listed in the sidebar, and
included when you export.

### What it reads

The files this tool exports round-trip, and the geometry is worked out from whichever columns
are present, so foreign files usually work too. The image column may be called `image_name`,
`image`, `filename`, `file` or `path`; the class column `class_name`, `class`, `label`,
`category` or `name`. Geometry is recognised as:

| Columns present | Read as |
| --- | --- |
| `n_keypoints`, `px1`, `py1` … (and `v1` …) | pose, 2D or 3D |
| `n_vertices`, `x1`, `y1` … | polygon |
| `x1` … `y4` | oriented box |
| `xc`/`cx`, `yc`/`cy`, `w`, `h` | box |
| `x1`, `y1`, `x2`, `y2` | line |
| `x`, `y`, `w`, `h` | box, `x, y` being its top-left corner |
| `x`, `y` | point |

A box and an ellipse are the same four numbers, so the filename breaks the tie: a file with
`ellipse` in its name is read as ellipses, anything else as rectangles.

If `image_width` and `image_height` are present and disagree with the loaded image, the
coordinates are **rescaled onto it** - which is what you want when predictions came from a
resized copy. The panel says when it has done that.

## Notes

**Nothing is saved anywhere.** Marker types and annotations live only as long as the tab
does — reloading or closing it throws them away, and the browser will ask you to confirm
first. Export the CSV before you leave.
