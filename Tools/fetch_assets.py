"""
Download every Pearl Cove 3D file listed in asset_manifest.json.

Run on your own machine (Python 3.9+, no extra packages):
    python Tools/fetch_assets.py
Files land in ./Assets (props) and ./Assets/<Character>/<Clip>.glb (characters).
If a link has expired, open the job in your Higgsfield library and download it there.
"""
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets")


def get(url, dest):
    if not url.startswith("https://"):
        print(f"  skip {os.path.basename(dest)} (no URL yet)")
        return
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        print(f"  have {os.path.relpath(dest, ROOT)}")
        return
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    print(f"  get  {os.path.relpath(dest, ROOT)}")
    urllib.request.urlretrieve(url, dest)


def main():
    with open(os.path.join(ROOT, "Tools", "asset_manifest.json"), encoding="utf-8") as f:
        m = json.load(f)
    print("Props")
    for p in m["props"]:
        get(p["url"], os.path.join(OUT, p["name"]))
    for name, ch in m["characters"].items():
        print(name)
        get(ch["base_model"], os.path.join(OUT, name, "_BaseModel.glb"))
        for clip, url in ch["clips"].items():
            get(url, os.path.join(OUT, name, f"{clip}.glb"))
    print("High-detail models")
    for p in m.get("hires", []):
        get(p["url"], os.path.join(OUT, "HiRes", p["name"]))
    for name, ch in m.get("characters_hires", {}).items():
        print(f"{name} (high detail)")
        get(ch["base_model"], os.path.join(OUT, "HiRes", name, "_BaseModel.glb"))
        for clip, url in ch["clips"].items():
            get(url, os.path.join(OUT, "HiRes", name, f"{clip}.glb"))
    print("Textures")
    for t in m.get("materials", []):
        get(t["url"], os.path.join(OUT, "Textures", t["name"]))
    print("Done. Next: Blender/cleanup_props.py and Blender/merge_character_animations.py")


if __name__ == "__main__":
    main()
