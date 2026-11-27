#!/usr/bin/env python3
"""
Descarga y reduce las fotos de ejercicios que usa la app.

  python3 scripts/fetch-exercise-images.py

Lee src/data/exerciseImages.json (plantilla de Hevy -> id en free-exercise-db) y
src/data/catalog.json (catálogo de máquinas; campo "image"), y deja en
public/ex/<id>/0.webp y 1.webp la posición inicial y la final de cada ejercicio.

Las fotos vienen de https://github.com/yuhonas/free-exercise-db, publicado en el
dominio público (Unlicense). Requiere Pillow con soporte WebP.
"""
import io
import json
import pathlib
import urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"
WIDTH = 480
QUALITY = 68

mapping = json.loads((ROOT / "src/data/exerciseImages.json").read_text("utf8"))
catalog = json.loads((ROOT / "src/data/catalog.json").read_text("utf8"))
ids = sorted({entry["id"] for entry in mapping.values()} | {entry["image"] for entry in catalog if entry.get("image")})
total = 0
for ex_id in ids:
    folder = ROOT / "public/ex" / ex_id
    folder.mkdir(parents=True, exist_ok=True)
    for n in (0, 1):
        target = folder / f"{n}.webp"
        if not target.exists():
            with urllib.request.urlopen(f"{SOURCE}/{ex_id}/{n}.jpg", timeout=30) as res:
                img = Image.open(io.BytesIO(res.read())).convert("RGB")
            height = round(img.height * WIDTH / img.width)
            img.resize((WIDTH, height), Image.LANCZOS).save(target, "WEBP", quality=QUALITY, method=6)
        total += target.stat().st_size
print(f"{len(ids)} ejercicios, {len(ids) * 2} imágenes, {total / 1024:.0f} KB en public/ex/")
