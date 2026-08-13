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

The `?` button in the top bar lists all of this in the app itself.

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

Markers are drawn as **outlines with no fill**, and their handles appear on their own as
soon as the cursor comes near an edge — nothing has to be clicked or selected first.
A marker can never be dragged around by its middle, so the inside of a box stays free
canvas that you can draw another marker on. Boxes and ellipses are reshaped by their
eight handles, lines by their two endpoints, and a point is picked up and moved once you
hover close enough to it.

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
| `class_name` | the marker type's name |
| `marker_type` | `point` · `rect` · `line` · `ellipse` |
| `x`, `y` | see the table below — the meaning depends on the marker type |
| `w`, `h` | box side lengths / full ellipse axes; empty for points and lines |
| `x2`, `y2` | the far end of a line; empty otherwise |
| `angle_deg` | clockwise rotation about the shape's own centre; `0` when not rotatable, empty for points and lines |

| Marker type | Columns used |
| --- | --- |
| `point` | `x`, `y` — the point itself |
| `rect` | `x`, `y` = top-left corner, `w`, `h`, `angle_deg` |
| `ellipse` | `x`, `y` = top-left corner of its box, `w`, `h`, `angle_deg` |
| `line` | `x`, `y` = start, `x2`, `y2` = end |

For a rotated box or ellipse, `x`, `y`, `w`, `h` describe it **before** rotation and
`angle_deg` turns it about its centre — so the four numbers stay exact, and at
`angle_deg = 0` they are simply the axis-aligned bounding box.

### Converting to YOLO

YOLO wants `class_id cx cy w h` normalised to 0–1, one `.txt` per image:

```python
import pandas as pd

df = pd.read_csv("annotations.csv")
df = df[df.marker_type == "rect"]
classes = sorted(df.class_name.unique())

for name, g in df.groupby("image_name"):
    W, H = g.image_width.iloc[0], g.image_height.iloc[0]
    lines = [
        f"{classes.index(r.class_name)} "
        f"{(r.x + r.w / 2) / W:.6f} {(r.y + r.h / 2) / H:.6f} "
        f"{r.w / W:.6f} {r.h / H:.6f}"
        for _, r in g.iterrows()
    ]
    open(name.rsplit(".", 1)[0] + ".txt", "w").write("\n".join(lines))
```

(YOLO boxes are axis-aligned, so this assumes `angle_deg` is 0. If you annotate rotated
boxes, either widen them to their bounding box first or use an oriented-box model.)

## Notes

**Nothing is saved anywhere.** Marker types and annotations live only as long as the tab
does — reloading or closing it throws them away, and the browser will ask you to confirm
first. Export the CSV before you leave.
