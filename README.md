# Annotator — ICYMARE 26

A zero-install image annotation tool for the "Machine Learning & YOLO for wildlife data"
workshop. It is a static web page: **every image stays in your browser**, nothing is
uploaded, no account, no software to install.

## Use it

Open the hosted page, drop a folder of images on it, draw markers, hit **Export CSV**.

## Run it locally

Just open `index.html` in a browser — there is no build step and no dependencies.

## Host it on GitHub Pages

1. Push this folder to a GitHub repository.
2. *Settings → Pages → Build and deployment → Deploy from a branch*, branch `main`, folder `/ (root)`.
3. The page appears at `https://<user>.github.io/<repo>/` after a minute.

## Controls

| Action | How |
| --- | --- |
| Draw a marker | Left-drag on the image (click for Point markers) |
| Move / resize | Left-drag the marker or one of its handles |
| Rotate | Drag the round handle above a rotatable marker (Shift snaps to 15°) |
| Pan | **Right-drag** (also middle-drag, or Space + drag) |
| Zoom | Mouse wheel · `+` / `−` · `F` fits the image |
| Delete one marker | Hold **Ctrl** and click it (a bin follows the cursor), or the bin tool `X` |
| Select many | Select tool `V`, then drag a box · Shift+click adds · `Ctrl+A` selects all |
| Delete a selection | `Delete`, or the bin button in the top bar |
| Switch marker type | Its hotkey `1`–`0`, or click it in the Markers panel |
| Previous / next image | `,` and `.` or the arrow keys |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |

The sidebar switches between **Images** and **Marker types** with the two icons on the
far left. Drag its right edge to resize it; click the active icon to collapse it.

## Marker types

A marker type is one annotation class: a name, a colour, an optional hotkey, and a mode.

| Mode | Drawn by | Rotation |
| --- | --- | --- |
| Point | a single click | – |
| Rectangle | dragging corner to corner (Shift = square) | optional |
| Line | dragging from start to end | – |
| Ellipse | dragging out its bounding box (Shift = circle) | optional |

Deleting a marker type also deletes every marker placed with it; the confirmation dialog
tells you how many.

## CSV output

One row per marker, coordinates in **absolute image pixels**, origin at the top-left corner.

| Column | Meaning |
| --- | --- |
| `image_name`, `image_width`, `image_height` | the source image |
| `marker_id` | unique id of this marker |
| `class_name` | the marker type's name |
| `marker_type` | `point` · `rect` · `line` · `ellipse` |
| `cx`, `cy` | marker centre (the point itself, or the line's midpoint) |
| `width`, `height` | side lengths of the rectangle / full axes of the ellipse; bounding-box extents for a line; `0` for a point |
| `angle_deg` | rotation, clockwise, `0` when not rotatable; for a line, its orientation |
| `x1`, `y1`, `x2`, `y2` | line endpoints only, empty otherwise |
| `bbox_x1` … `bbox_y2` | axis-aligned bounding box of the marker — the column pair to use when converting to YOLO |

### Converting to YOLO

YOLO wants `class_id cx cy w h` normalised to 0–1, one `.txt` per image:

```python
import pandas as pd

df = pd.read_csv("annotations.csv")
classes = sorted(df.class_name.unique())

for name, g in df.groupby("image_name"):
    W, H = g.image_width.iloc[0], g.image_height.iloc[0]
    lines = []
    for _, r in g.iterrows():
        cx = (r.bbox_x1 + r.bbox_x2) / 2 / W
        cy = (r.bbox_y1 + r.bbox_y2) / 2 / H
        w  = (r.bbox_x2 - r.bbox_x1) / W
        h  = (r.bbox_y2 - r.bbox_y1) / H
        lines.append(f"{classes.index(r.class_name)} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}")
    open(name.rsplit(".", 1)[0] + ".txt", "w").write("\n".join(lines))
```

## Notes

Work in progress is kept in the browser's `localStorage`, keyed by filename and file size —
reload the page, add the same images again, and your markers come back. It is not a
substitute for exporting: clearing site data loses everything.
