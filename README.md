# ICYMARE 2026 — From Image to Analysis

<p align="center">
  <img
    width="600"
    height="auto"
    alt="ICYMARE 2026"
    src="https://github.com/user-attachments/assets/25c37d0b-bc7a-4b0c-8cdb-45939b82002b"
  />
</p>

## A Practical Workshop on Automated Wildlife Detection

This repository contains the annotation tool, datasets, and supporting material for the
**From Image to Analysis: A Practical Workshop on Automated Wildlife Detection** workshop
at ICYMARE 2026 in Bremen.

The workshop follows the complete path from raw wildlife imagery through annotation,
model training, prediction inspection, and analysis.

## Workshop resources

| Resource | Description | Link |
| --- | --- | --- |
| Annotation tool | Browser-based tool for drawing, importing, inspecting, and exporting annotations | [Open](https://johannes-bartl.github.io/icymare26-workshop/) |
| Annotation practice dataset | Six small image subsets for annotation exercises | [Download](https://github.com/johannes-bartl/icymare26-workshop/releases/tag/annotation-dataset) |
| Training dataset | Prepared data for the model-training part of the workshop | [Download](https://github.com/johannes-bartl/icymare26-workshop/releases/tag/training-dataset) |
| Google Colab notebook | Guided model-training and analysis notebook | **Coming soon** |
| Source code | Annotation tool and workshop repository | [View the repository](https://github.com/johannes-bartl/icymare26-workshop) |

The Colab notebook will be stored in this repository as:

```text
notebooks/icymare26_workshop.ipynb
```

# Datasets

## Annotation practice dataset

A small teaching dataset assembled for ICYMARE 2026. The images are samples drawn from
real Antarctic and sub-Antarctic wildlife monitoring programmes.

[Download the annotation practice dataset](https://github.com/johannes-bartl/icymare26-workshop/releases/tag/annotation-dataset)

The complete download is approximately 156 MB. Each subset is provided as a separate ZIP
archive.


## Training dataset

The larger prepared dataset used during the model-training exercises is distributed as a
separate release:

[Download the training dataset](https://github.com/johannes-bartl/icymare26-workshop/releases/tag/training-dataset)


# Annotation tool

[Open the annotation tool](https://johannes-bartl.github.io/icymare26-workshop/)

The repository includes a zero-install image annotation tool created for the workshop.
It is a static web application:

- no account is required
- no installation or build process is required
- images and annotations remain inside the browser
- nothing is uploaded to a server
- the tool can be used online or by opening `index.html` locally

## Run it locally

Download or clone this repository and open `index.html` in a modern browser.

No web server, package manager, build step, or external dependency is required.

## Typical workflow

1. Drop one or more images—or an entire image folder—onto the tool.
2. Create a marker type or load annotation CSV files.
3. Draw new annotations or inspect existing ones.
4. Correct marker geometry and class assignments.
5. Export the result before closing or reloading the page.

Images and CSV files can be dropped together. The tool separates them automatically,
loads the images first, and then matches the CSV rows to their images.

## Controls

The **Get help** button in the top bar also lists the controls inside the application.

| Action | Control |
| --- | --- |
| Draw a marker | Left-drag on the image; click once for a point |
| Resize or move a handle | Left-drag the handle |
| Rotate a marker | Drag its round rotation handle; hold `Shift` to snap to 15° |
| Pan | Right-drag, middle-drag, or hold `Space` while dragging |
| Zoom | Mouse wheel, `+`, `−`, or `F` to fit |
| Rotate the displayed image | `R`; this does not change exported coordinates |
| Delete a marker | Hold `Ctrl` and click it, or activate the delete tool with `X` |
| Select multiple markers | Activate selection with `V`, then drag a selection box |
| Add to a selection | `Shift`+click |
| Select everything on an image | `Ctrl+A` |
| Delete the selection | `Delete` |
| Switch marker type | Press its assigned key from `1` to `0` |
| Previous or next image | `,` and `.`, or the arrow buttons |
| Undo or redo | `Ctrl+Z` and `Ctrl+Shift+Z` |
| Lock existing markers | `L` or the padlock button |
| Collapse bounding boxes | `B`; configure the display from the top bar |
| Change keypoint visibility | Hover the keypoint and press `O`, or `Alt`+click it |
| Remove an image | Use the bin on its image row |

Markers are drawn as outlines without a fill. Their edit handles appear when the cursor
approaches an edge, endpoint, or vertex.

A bounding box cannot be dragged by its centre. This leaves the interior available as
canvas space, allowing another marker to be drawn inside an existing box.

The sidebar contains three panels:

- **Images** lists the loaded images
- **Marker types** contains classes, annotations, and editable properties
- **Inspect** manages imported annotation CSV files

The sidebar can be resized by dragging its right edge. Clicking the active panel icon
collapses it.

## Locking existing work

The padlock in the top bar protects annotations that have already been placed.

When locked, the annotation tool creates new markers but does not expose edit handles for
existing markers. Hold `Shift` temporarily when an existing marker needs to be corrected.

This is useful when an image is nearly complete and accidental edits would be especially
disruptive.

## Collapsed bounding boxes

The bounding-box button in the top bar opens the collapsed-box configuration.

When enabled—or toggled with `B`—rectangles are displayed as small square markers. Moving
the cursor into a box reveals its complete outline and edit handles.

The display marker can be positioned anywhere inside the original rectangle. Separate
positions can optionally be configured for:

- standing boxes, where height is greater than or equal to width
- lying boxes, where width is greater than height

Collapsing boxes changes only how they are displayed. It never changes the stored or
exported geometry.

# Marker types

A marker type defines one annotation class. It has:

- a name
- a colour
- an optional number-key shortcut
- a drawing mode
- optional mode-specific settings

| Mode | Drawing method | Rotation |
| --- | --- | --- |
| Point | Single click | — |
| Rectangle | Drag from corner to corner; `Shift` creates a square | Optional |
| Line | Drag between endpoints, or click each endpoint | — |
| Ellipse | Drag its bounding box; `Shift` creates a circle | Optional |
| Polygon | Click vertices or drag to trace a boundary | — |
| Pose | Draw a box containing a predefined skeleton | — |

Deleting a marker type also deletes every annotation assigned to it. The confirmation
dialog reports how many annotations will be affected.

## Lines

A line can be drawn in either of two ways:

- drag directly from one endpoint to the other
- click once for the first endpoint and again for the second

The two-click method is useful when the endpoints are far apart because the image can be
panned between clicks. Press `Esc` to abandon an unfinished line.

## Polygons

Click to place individual vertices or drag to trace a sequence of vertices. Both methods
can be combined in one polygon.

Close the polygon by:

- clicking the first vertex
- pressing `Enter`
- double-clicking

While drawing:

- `Backspace` removes the most recent vertex
- `Esc` abandons the unfinished polygon

After drawing:

- drag a vertex to move it
- hover an edge and drag the displayed `+` to insert a vertex
- hold `Alt` and click a vertex to remove it

A polygon always retains at least three vertices. For complex polygons, only nearby
handles are displayed so the outline remains visible.

## Poses

A pose marker type contains a skeleton blueprint: an ordered list of keypoints, the bones
between them, and the keypoint pairs that exchange places during horizontal flipping.

Draw a pose by dragging its bounding box. The complete template skeleton is placed inside
the box, ready for correction.

- drag a keypoint to move and confirm it
- hover a keypoint and press `O` to cycle its visibility
- `Alt`+click provides the same mouse-only visibility control
- visibility cycles through **visible → occluded → absent**
- untouched template points remain hollow and faded
- resizing the outer box does not move confirmed keypoints

## Skeleton blueprints

Open the **Skeleton** editor from a pose marker type.

Inside the editor:

- click empty space to add a keypoint
- drag a keypoint to reposition it
- click one point and then another to connect or disconnect them
- press `Delete` to remove the selected keypoint
- press `Esc` to clear the selection

New points chain from the currently selected point, making it possible to draw a limb one
joint at a time.

The **Start from** menu provides the following presets:

- Empty
- Quadruped
- Pinniped
- Bird
- Fish
- COCO-17 human

The position of each point defines the initial pose template.

The keypoint list can be used to:

- rename keypoints
- assign centre, left, or right sides
- move keypoints up or down in the export order
- automatically match left/right pairs with **Auto-pair L/R**

Mirror pairs become YOLO's `flip_idx`. They ensure that left and right labels are swapped
correctly during horizontal training augmentation.

> The COCO-17 preset contains exactly 17 keypoints and 19 bones. It does not contain a
> neck keypoint because the COCO specification does not define one.

Skeleton blueprints can be imported and exported as JSON. Sharing one blueprint prevents
participants from creating datasets with incompatible keypoint orders.

Once a pose has been annotated, operations that would change its keypoint indices are
locked. Names, template positions, and bones can still be edited safely.

# Marker properties

Expand a marker type in the sidebar to see every annotation assigned to it, grouped by
image.

Clicking an annotation:

- opens its image
- selects the marker
- centres it in the viewport
- reveals its editable numeric properties

All numeric values use absolute image pixels.

| Mode | Editable properties | Additional information |
| --- | --- | --- |
| Point | `x`, `y` | — |
| Rectangle | `x`, `y`, `w`, `h`, and optionally `angle` | — |
| Ellipse | `x`, `y`, `w`, `h`, and optionally `angle` | — |
| Line | `x1`, `y1`, `x2`, `y2` | Length and bearing |
| Polygon | Bounding `x`, `y`, `w`, `h` | Vertex count and area |
| Pose | Bounding `x`, `y`, `w`, `h`, keypoint positions, and visibility | Confirmed-keypoint count |

Inside the editor, `x` and `y` describe the top-left corner of a box. Changing its width
therefore grows it towards the right rather than equally around its centre.

Exported rectangle, ellipse, and pose boxes use centre coordinates instead.

# Export formats

The export geometry follows the field ordering used by YOLO tasks:

| Task | Geometry order |
| --- | --- |
| Detection | `cls xc yc w h` |
| Oriented bounding box | `cls x1 y1 x2 y2 x3 y3 x4 y4` |
| Segmentation | `cls x1 y1 x2 y2 ... xn yn` |
| 2D pose | `cls xc yc w h px1 py1 px2 py2 ...` |
| Pose with visibility | `cls xc yc w h px1 py1 v1 px2 py2 v2 ...` |

Every CSV begins with:

```text
image_name,image_width,image_height,class_name
```

The remaining geometry columns depend on the drawing mode:

| Export file | Contents | Geometry columns |
| --- | --- | --- |
| `points.csv` | Point markers | `x, y` |
| `lines.csv` | Line markers | `x1, y1, x2, y2` |
| `rectangles.csv` | Non-rotated rectangles | `xc, yc, w, h` |
| `rectangles_obb.csv` | Rotated rectangles | Four clockwise corners, starting at the top-left |
| `ellipses.csv` | Non-rotated ellipses | `xc, yc, w, h` |
| `ellipses_obb.csv` | Rotated ellipses | Four oriented-box corners |
| `polygons.csv` | Polygons | `n_vertices`, followed by vertex coordinates |
| `poses.csv` | Poses without visibility | `xc, yc, w, h, n_keypoints`, followed by keypoints |
| `poses_3d.csv` | Poses with visibility | `xc, yc, w, h, n_keypoints`, followed by keypoints and visibility |
| `skeletons.json` | Pose blueprints | Skeleton definitions, `kpt_shape`, and `flip_idx` |

Rotated rectangles and ellipses are exported using four oriented-box corners rather than
an angle column.

Enabling keypoint visibility changes the pose export from `poses.csv` to `poses_3d.csv`.
Its `kpt_shape` changes from `[n, 2]` to `[n, 3]`.

Polygon and pose rows may have different lengths. Shorter rows are padded to the maximum
row length in that file. The `n_vertices` and `n_keypoints` fields identify where the real
coordinates end.

> Coordinates are stored as absolute image pixels, not normalised values.
> `image_width` and `image_height` are included on every row so coordinates can be
> converted to the 0–1 range when preparing YOLO labels.

Several classes that share one encoding are written to the same file and distinguished by
`class_name`.

Hover over **Export** to see the available files, annotation counts, and included marker
types. Individual files can be downloaded separately. When multiple outputs are selected,
the tool packages them into a ZIP archive.

# Inspecting existing annotations

The **Inspect** panel loads annotation CSV files and draws them on the corresponding
images. It can be used for:

- reopening an earlier export
- inspecting model predictions
- comparing annotation files
- correcting annotations supplied by another person

## Loading CSV files

Load the images before loading their annotations. CSV rows are matched to images by
filename.

CSV files can be dropped:

- anywhere within the complete Inspect panel
- onto the main workspace
- together with their corresponding images

The tool reports how many images and annotations were loaded.

Additional behaviour:

- one CSV may contain annotations for multiple images
- any number of CSV files may be loaded
- class chips are displayed alphabetically
- new classes automatically receive marker types and colours
- matching classes reuse an existing marker type when both name and encoding agree
- the same class name can coexist across different encodings
- imported annotations remain editable and are included in later exports

Removing a CSV source removes only the annotations that it introduced. Automatically
created marker types are removed when they are no longer used. Manually created work is
not affected.

Undo restores both the imported annotations and their source entry.

## Supported CSV layouts

The importer identifies columns by their names. The image column may be named:

```text
image_name, image, filename, file, path
```

The class column may be named:

```text
class_name, class, label, category, name
```

Geometry is recognised as follows:

| Columns | Imported as |
| --- | --- |
| `n_keypoints`, `px1`, `py1` … and optionally `v1` … | Pose |
| `n_vertices`, `x1`, `y1` … | Polygon |
| `x1` … `y4` | Oriented bounding box |
| `xc` or `cx`, `yc` or `cy`, `w`, `h` | Centre-based box |
| `x1`, `y1`, `x2`, `y2` | Line |
| `x`, `y`, `w`, `h` | Top-left-based box |
| `x`, `y` | Point |

Boxes and ellipses use the same four unrotated geometry values. A filename containing
`ellipse` is therefore interpreted as ellipse data; other matching files are interpreted
as rectangles.

When CSV image dimensions differ from the loaded image dimensions, coordinates are
rescaled automatically. The Inspect panel reports when rescaling has occurred.

# Privacy and persistence

Everything runs locally in the browser. Images, marker types, and annotations are not sent
to a server.

The current annotation session is temporary. Reloading or closing the page discards the
loaded images and annotations, and the browser asks for confirmation before leaving.

Always export your annotations before closing the tool.
