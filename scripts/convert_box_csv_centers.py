"""Convert legacy top-left box CSVs to centre-coordinate CSVs.

Only files carrying x,y,w,h,angle_deg are changed. Other CSVs (for example a
rename map) are ignored. Databases are never opened or modified.
"""

from __future__ import annotations

import argparse
import csv
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
import tempfile


CENT = Decimal("0.01")


def number(value: Decimal) -> str:
    text = format(value.quantize(CENT, rounding=ROUND_HALF_UP), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def converted(path: Path) -> tuple[list[str], list[dict[str, str]]] | None:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames or []
        required = {"x", "y", "w", "h", "angle_deg"}
        if not required.issubset(fields):
            return None
        rows = list(reader)

    out_fields = ["xc" if name == "x" else "yc" if name == "y" else name
                  for name in fields if name != "angle_deg"]
    out_rows: list[dict[str, str]] = []
    for line_no, row in enumerate(rows, 2):
        try:
            xc = Decimal(row["x"]) + Decimal(row["w"]) / 2
            yc = Decimal(row["y"]) + Decimal(row["h"]) / 2
        except (InvalidOperation, KeyError) as exc:
            raise ValueError(f"{path}:{line_no}: invalid box coordinates") from exc
        out: dict[str, str] = {}
        for name in fields:
            if name == "angle_deg":
                continue
            if name == "x":
                out["xc"] = number(xc)
            elif name == "y":
                out["yc"] = number(yc)
            else:
                out[name] = row.get(name, "")
        out_rows.append(out)
    return out_fields, out_rows


def write_atomic(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", newline="", dir=path.parent, delete=False, suffix=".tmp"
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)
        temp_path = Path(handle.name)
    temp_path.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    parser.add_argument("--apply", action="store_true", help="write changes (default: validate only)")
    args = parser.parse_args()

    plans: list[tuple[Path, list[str], list[dict[str, str]]]] = []
    for path in sorted(args.directory.rglob("*.csv")):
        result = converted(path)
        if result is not None:
            fields, rows = result
            plans.append((path, fields, rows))

    total_rows = sum(len(rows) for _, _, rows in plans)
    if args.apply:
        for path, fields, rows in plans:
            write_atomic(path, fields, rows)
    action = "Converted" if args.apply else "Validated"
    print(f"{action} {len(plans)} box CSV files ({total_rows} rows).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
