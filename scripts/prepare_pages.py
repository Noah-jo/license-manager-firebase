"""Build content-versioned Pages assets without changing the editable sources."""

import hashlib
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]


def versioned_name(name, content):
    path = Path(name)
    digest = hashlib.sha256(content).hexdigest()[:16]
    return f"{path.stem}.{digest}{path.suffix}"


def build_assets(source):
    result = dict(source)
    config = versioned_name("firebase-config.js", source["firebase-config.js"])
    result[config] = source["firebase-config.js"]
    app = source["app.js"].decode("utf-8")
    if '"./firebase-config.js"' not in app:
        raise ValueError("Missing Firebase config import")
    app_bytes = app.replace('"./firebase-config.js"', f'"./{config}"').encode("utf-8")
    app_name = versioned_name("app.js", app_bytes)
    result[app_name] = app_bytes
    index = source["index.html"].decode("utf-8")
    for original, content in [("app.js", app_bytes), ("styles.css", source["styles.css"]), ("favicon.svg", source["favicon.svg"])]:
        name = versioned_name(original, content)
        result[name] = content
        if f'"./{original}"' not in index:
            raise ValueError(f"Missing index reference: {original}")
        index = index.replace(f'"./{original}"', f'"./{name}"')
    result["index.html"] = index.encode("utf-8")
    return result


def verify(source):
    built = build_assets(source)
    assert built == build_assets(source), "Build must be deterministic"
    index = built["index.html"].decode("utf-8")
    for asset in ["app.js", "styles.css", "favicon.svg"]:
        assert f'"./{asset}"' not in index
    app_name = next(name for name in built if name.startswith("app.") and name.endswith(".js") and name != "app.js")
    assert b'"./firebase-config.js"' not in built[app_name]
    for asset in ["app.js", "styles.css", "firebase-config.js"]:
        changed = dict(source)
        changed[asset] += b"\n/* changed */"
        rebuilt = build_assets(changed)
        assert rebuilt["index.html"] != built["index.html"], f"{asset} changes must invalidate index asset URLs"
    for name in [app_name, versioned_name("styles.css", source["styles.css"]), versioned_name("favicon.svg", source["favicon.svg"])]:
        assert f'"./{name}"' in index and name in built
    assert versioned_name("firebase-config.js", source["firebase-config.js"]).encode() in built[app_name]
    print("Pages asset version checks passed (stable builds and JS/CSS/config cache invalidation).")


def main():
    source = {path.relative_to(ROOT / "public").as_posix(): path.read_bytes() for path in (ROOT / "public").rglob("*") if path.is_file()}
    verify(source)
    if "--verify-only" in sys.argv:
        return
    target = ROOT / "_site"
    target.mkdir(exist_ok=False)
    for name, content in build_assets(source).items():
        path = target / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    print(f"Prepared Pages artifact: {target}")


if __name__ == "__main__":
    main()
