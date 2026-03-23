import csv
import json
import os


ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STYLE_JSON_FILE = os.path.join(ROOT_DIR, "styles.json")
LEGACY_STYLE_CSV_FILE = os.path.join(ROOT_DIR, "styles.csv")
CUSTOM_STYLE_JSON_FILE = os.path.join(ROOT_DIR, "my_styles.json")
LEGACY_CUSTOM_STYLE_CSV_FILE = os.path.join(ROOT_DIR, "my_styles.csv")


def _normalize_style_prompts(value):
    if isinstance(value, (list, tuple)):
        positive = str(value[0] if len(value) > 0 else "").strip()
        negative = str(value[1] if len(value) > 1 else "").strip()
    elif isinstance(value, dict):
        positive = str(value.get("positive") or value.get("positive_prompt") or "").strip()
        negative = str(value.get("negative") or value.get("negative_prompt") or "").strip()
    else:
        raise ValueError("Style phải có dạng mảng [positive, negative].")
    return [positive, negative]


def _load_style_json(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}

    if not isinstance(data, dict):
        return {}

    styles = {}
    for raw_name, raw_value in data.items():
        name = str(raw_name).strip()
        if not name:
            continue
        try:
            styles[name] = _normalize_style_prompts(raw_value)
        except ValueError:
            continue
    return styles


def _load_style_csv(path):
    if not os.path.exists(path):
        return {}
    styles = {}
    with open(path, "r", encoding="utf-8-sig", newline="") as file:
        reader = csv.reader(file)
        for row in reader:
            if not row:
                continue
            name = str(row[0] if len(row) > 0 else "").strip()
            if not name:
                continue
            positive = str(row[1] if len(row) > 1 else "").strip()
            negative = str(row[2] if len(row) > 2 else "").strip()
            styles[name] = [positive, negative]
    return styles


def _save_style_json(path, styles):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(styles, f, ensure_ascii=False, indent=2)


def ensure_style_files():
    if not os.path.exists(STYLE_JSON_FILE) and os.path.exists(LEGACY_STYLE_CSV_FILE):
        _save_style_json(STYLE_JSON_FILE, _load_style_csv(LEGACY_STYLE_CSV_FILE))
    if not os.path.exists(CUSTOM_STYLE_JSON_FILE) and os.path.exists(LEGACY_CUSTOM_STYLE_CSV_FILE):
        _save_style_json(CUSTOM_STYLE_JSON_FILE, _load_style_csv(LEGACY_CUSTOM_STYLE_CSV_FILE))


def load_default_styles():
    ensure_style_files()
    return _load_style_json(STYLE_JSON_FILE)


def load_custom_styles():
    ensure_style_files()
    return _load_style_json(CUSTOM_STYLE_JSON_FILE)


def style_names():
    default_styles = load_default_styles()
    custom_styles = load_custom_styles()
    return list(default_styles.keys()) + list(custom_styles.keys())


def style_list():
    styles = {**load_default_styles(), **load_custom_styles()}
    names = list(styles.keys())
    rows = [[name, values[0], values[1]] for name, values in styles.items()]
    return names, rows


def get_style_prompts(style_name):
    if not style_name or style_name == "None":
        return "", ""
    default_styles = load_default_styles()
    if style_name in default_styles:
        positive, negative = default_styles[style_name]
        return positive, negative
    custom_styles = load_custom_styles()
    positive, negative = custom_styles.get(style_name, ["", ""])
    return positive, negative


def save_custom_style(name, positive_prompt, negative_prompt, previous_name=""):
    style_name = str(name or "").strip()
    old_name = str(previous_name or "").strip()
    if not style_name:
        raise ValueError("Tên style không được để trống.")

    default_styles = load_default_styles()
    if style_name in default_styles:
        raise ValueError("Tên style trùng style mặc định.")

    custom_styles = load_custom_styles()
    if old_name and old_name not in default_styles and old_name != style_name:
        custom_styles.pop(old_name, None)
    custom_styles[style_name] = _normalize_style_prompts([positive_prompt, negative_prompt])
    _save_style_json(CUSTOM_STYLE_JSON_FILE, custom_styles)
    return custom_styles


def delete_custom_style(name):
    style_name = str(name or "").strip()
    if not style_name:
        raise ValueError("Thiếu tên style.")
    if style_name in load_default_styles():
        raise ValueError("Không thể xóa style mặc định.")

    custom_styles = load_custom_styles()
    if style_name not in custom_styles:
        raise ValueError("Style không tồn tại.")

    custom_styles.pop(style_name, None)
    _save_style_json(CUSTOM_STYLE_JSON_FILE, custom_styles)
    return custom_styles
