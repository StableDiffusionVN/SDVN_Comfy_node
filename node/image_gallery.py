import server
from aiohttp import web
import os
import json
import math
import hashlib
import torch
import numpy as np
from PIL import Image, ImageOps
import urllib.parse
import io
import re
from comfy.utils import common_upscale
import folder_paths

NODE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_FILE = os.path.join(NODE_DIR, "config.json")
METADATA_FILE = os.path.join(NODE_DIR, "metadata.json")
SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp']
DEFAULT_PER_PAGE = 80

def sanitize_filename(name):
    if not name:
        return "image"
    base = os.path.basename(str(name))
    cleaned = re.sub(r'[\\/:*?"<>|]+', "_", base).strip()
    return cleaned or "image"

def read_file_field_bytes(file_field):
    file_field.file.seek(0)
    return file_field.file.read()

def ensure_supported_extension(filename):
    ext = os.path.splitext(filename)[1].lower()
    if ext not in SUPPORTED_IMAGE_EXTENSIONS:
        raise ValueError("Unsupported file type.")
    return ext

def ensure_config():
    config = {}

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
        except Exception as e:
            print(f"Lỗi đọc {CONFIG_FILE}: {e}")
            config = {}
    else:
        print(f"Không tìm thấy {CONFIG_FILE}, sẽ tạo mới.")

    if "saved_paths" not in config or not isinstance(config["saved_paths"], list):
        config["saved_paths"] = []
    
    input_dir = folder_paths.get_input_directory()
    output_dir = folder_paths.get_output_directory()
    default_dir = [input_dir, output_dir]

    for path in default_dir:
        if path not in config["saved_paths"]:
            config["saved_paths"].append(path)
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
        print(f"Đã cập nhật {CONFIG_FILE}")
    except Exception as e:
        print(f"Lỗi ghi {CONFIG_FILE}: {e}")
    return config

ensure_config()

def save_config(data):
    try:
        with open(CONFIG_FILE, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4)
    except Exception as e: print(f"LocalImageGallery: Error saving config: {e}")

def load_config():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f: return json.load(f)
        except: pass
    return {}

def load_metadata():
    if not os.path.exists(METADATA_FILE): return {}
    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f: return json.load(f)
    except: return {}

def save_metadata(data):
    try:
        with open(METADATA_FILE, 'w', encoding='utf-8') as f: json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception as e: print(f"LocalImageGallery: Error saving metadata: {e}")

def normalize_directory(path):
    if not path:
        return ""
    try:
        return os.path.abspath(path)
    except Exception:
        return path

def parse_selected_paths(raw):
    if not raw:
        return []
    if isinstance(raw, list):
        return [os.path.abspath(str(item)) for item in raw if isinstance(item, str)]
    if isinstance(raw, str):
        stripped = raw.strip()
        if not stripped:
            return []
        try:
            data = json.loads(stripped)
            if isinstance(data, list):
                return [os.path.abspath(str(item)) for item in data if isinstance(item, str)]
        except json.JSONDecodeError:
            pass
        return [os.path.abspath(line.strip()) for line in stripped.splitlines() if line.strip()]
    return []

class ImageGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selected_paths": ("STRING", {"default": "", "multiline": True, "tooltip": "Không chỉnh sửa. Tự động cập nhật từ Image Gallery."}),
                "current_directory": ("STRING", {"default": "", "multiline": False, "tooltip": "Thư mục đang mở trong Image Gallery."}),
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "get_selected_media"
    CATEGORY = "📂 SDVN"

    @classmethod
    def IS_CHANGED(cls, selected_paths="", current_directory="", **kwargs):
        if isinstance(selected_paths, str):
            payload = selected_paths
            if isinstance(current_directory, str):
                payload = f"{selected_paths}|{current_directory}"
            return hashlib.sha1(payload.encode("utf-8")).hexdigest()
        return float("inf")

    def get_selected_media(self, selected_paths="", current_directory=""):
        image_paths = parse_selected_paths(selected_paths)
        image_tensors = []
        info_strings = []
        final_image_tensor = torch.zeros((1, 1, 1, 3), dtype=torch.float32)

        if image_paths:
            sizes = {}
            valid_image_paths = []
            for media_path in image_paths:
                if not os.path.exists(media_path):
                    continue
                ext = os.path.splitext(media_path)[1].lower()
                if ext not in SUPPORTED_IMAGE_EXTENSIONS:
                    continue
                try:
                    with Image.open(media_path) as img:
                        sizes[img.size] = sizes.get(img.size, 0) + 1
                        valid_image_paths.append(media_path)
                except Exception as e:
                    print(f"SDVN ImageGallery: Error reading size for {media_path}: {e}")

            if valid_image_paths:
                dominant_size = max(sizes.items(), key=lambda x: x[1])[0]
                target_width, target_height = dominant_size

                for media_path in valid_image_paths:
                    try:
                        with Image.open(media_path) as img:
                            img_out = img.convert("RGB")
                            if img.size[0] != target_width or img.size[1] != target_height:
                                img_array_pre = np.array(img_out).astype(np.float32) / 255.0
                                tensor_pre = torch.from_numpy(img_array_pre)[None,].permute(0, 3, 1, 2)
                                tensor_post = common_upscale(tensor_pre, target_width, target_height, "lanczos", "center")
                                img_array = tensor_post.permute(0, 2, 3, 1).cpu().numpy().squeeze(0)
                            else:
                                img_array = np.array(img_out).astype(np.float32) / 255.0
                            image_tensor = torch.from_numpy(img_array)[None,]
                            image_tensors.append(image_tensor)

                            full_info = {
                                "filename": os.path.basename(media_path),
                                "width": img.width,
                                "height": img.height,
                                "mode": img.mode,
                                "format": img.format,
                            }
                            metadata = {}
                            if 'parameters' in img.info:
                                metadata['parameters'] = img.info['parameters']
                            if 'prompt' in img.info:
                                metadata['prompt'] = img.info['prompt']
                            if 'workflow' in img.info:
                                metadata['workflow'] = img.info['workflow']
                            if metadata:
                                full_info['metadata'] = metadata
                            info_strings.append(json.dumps(full_info, ensure_ascii=False))
                    except Exception as e:
                        print(f"SDVN ImageGallery: Error processing image {media_path}: {e}")

                if image_tensors:
                    final_image_tensor = torch.cat(image_tensors, dim=0)

        return (final_image_tensor,)

prompt_server = server.PromptServer.instance

@prompt_server.routes.post("/local_image_gallery/update_metadata")
async def update_metadata(request):
    try:
        data = await request.json()
        path, rating, tags = data.get("path"), data.get("rating"), data.get("tags")
        if not path or not os.path.isabs(path): return web.json_response({"status": "error", "message": "Invalid path."}, status=400)
        metadata = load_metadata()
        if path not in metadata: metadata[path] = {}
        if rating is not None: metadata[path]['rating'] = int(rating)
        if tags is not None: metadata[path]['tags'] = [str(tag).strip() for tag in tags if str(tag).strip()]
        save_metadata(metadata)
        return web.json_response({"status": "ok", "message": "Metadata updated"})
    except Exception as e: return web.json_response({"status": "error", "message": str(e)}, status=500)

@prompt_server.routes.get("/local_image_gallery/get_saved_paths")
async def get_saved_paths(request):
    config = load_config()
    return web.json_response({"saved_paths": config.get("saved_paths", [])})

@prompt_server.routes.post("/local_image_gallery/save_paths")
async def save_paths(request):
    try:
        data = await request.json()
        paths = data.get("paths", [])
        config = load_config()
        config["saved_paths"] = paths
        save_config(config)
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@prompt_server.routes.get("/local_image_gallery/get_all_tags")
async def get_all_tags(request):
    try:
        metadata = load_metadata()
        all_tags = set()
        for item_meta in metadata.values():
            tags = item_meta.get("tags")
            if isinstance(tags, list):
                for tag in tags:
                    all_tags.add(tag)
        
        sorted_tags = sorted(list(all_tags), key=lambda s: s.lower())
        return web.json_response({"tags": sorted_tags})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@prompt_server.routes.get("/local_image_gallery/images")
async def get_local_images(request):
    directory = normalize_directory(request.query.get('directory', '').strip())
    if not directory:
        directory = folder_paths.get_input_directory()

    if not os.path.isdir(directory):
        return web.json_response({"error": "Directory not found."}, status=404)

    filter_tag = request.query.get('filter_tag', '').strip().lower()
    sort_by = request.query.get('sort_by', 'name')
    sort_order = request.query.get('sort_order', 'asc')
    page = max(1, int(request.query.get('page', 1)))
    per_page = max(1, int(request.query.get('per_page', DEFAULT_PER_PAGE)))

    metadata = load_metadata()
    all_items = []

    try:
        entries = os.scandir(directory)
    except PermissionError:
        return web.json_response({"error": "Permission denied."}, status=403)

    for entry in entries:
        try:
            if entry.is_dir():
                stat_info = entry.stat()
                all_items.append({
                    'path': entry.path,
                    'name': entry.name,
                    'type': 'dir',
                    'mtime': stat_info.st_mtime,
                })
                continue

            ext = os.path.splitext(entry.name)[1].lower()
            if ext not in SUPPORTED_IMAGE_EXTENSIONS:
                continue

            item_meta = metadata.get(entry.path, {})
            tags = item_meta.get('tags', [])
            if filter_tag:
                if filter_tag not in entry.name.lower():
                    continue

            stat_info = entry.stat()
            all_items.append({
                'path': entry.path,
                'name': entry.name,
                'type': 'image',
                'mtime': stat_info.st_mtime,
                'size': stat_info.st_size,
                'rating': item_meta.get('rating', 0),
                'tags': tags,
            })
        except (PermissionError, FileNotFoundError):
            continue

    def sort_key(item):
        if sort_by == 'date':
            return item.get('mtime', 0)
        if sort_by == 'size':
            return item.get('size', 0)
        if sort_by == 'rating':
            return item.get('rating', 0)
        return item.get('name', '').lower()

    reverse_sort = (sort_order == 'desc')
    dirs = [item for item in all_items if item['type'] == 'dir']
    files = [item for item in all_items if item['type'] != 'dir']
    dirs.sort(key=sort_key, reverse=reverse_sort)
    files.sort(key=sort_key, reverse=reverse_sort)
    all_items = dirs + files

    total_items = len(all_items)
    total_pages = max(1, math.ceil(total_items / per_page))
    page = min(page, total_pages)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_items = all_items[start_idx:end_idx]

    parent_directory = os.path.dirname(directory)
    input_dir = folder_paths.get_input_directory()
    if os.path.normpath(parent_directory) == os.path.normpath(directory):
        parent_directory = None
    elif os.path.normpath(directory) == os.path.normpath(input_dir):
        parent_directory = None

    return web.json_response({
        "items": paginated_items,
        "total_pages": total_pages,
        "current_page": page,
        "current_directory": directory,
        "parent_directory": parent_directory,
    })

@prompt_server.routes.post("/local_image_gallery/delete")
async def delete_gallery_images(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid JSON payload."}, status=400)

    raw_paths = data.get("paths", [])
    if isinstance(raw_paths, str):
        raw_paths = [raw_paths]
    if not isinstance(raw_paths, list):
        return web.json_response({"status": "error", "message": "paths must be a list."}, status=400)

    metadata = load_metadata()
    deleted = []
    errors = []
    metadata_changed = False

    for raw_path in raw_paths:
        if not isinstance(raw_path, str):
            continue
        target_path = os.path.abspath(raw_path)
        if not os.path.isfile(target_path):
            errors.append(f"Not found: {target_path}")
            continue
        try:
            os.remove(target_path)
            deleted.append(target_path)
            if target_path in metadata:
                metadata.pop(target_path, None)
                metadata_changed = True
        except Exception as e:
            errors.append(f"{target_path}: {e}")

    if metadata_changed:
        save_metadata(metadata)

    return web.json_response({
        "status": "ok" if deleted else "error",
        "deleted": deleted,
        "errors": errors,
    }, status=200 if deleted else 400)

@prompt_server.routes.post("/local_image_gallery/save_image")
async def save_gallery_image(request):
    try:
        data = await request.post()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid form payload."}, status=400)

    target_path = data.get("path")
    file_field = data.get("image")
    if not target_path or not isinstance(target_path, str):
        return web.json_response({"status": "error", "message": "Missing path."}, status=400)
    if not file_field or not hasattr(file_field, "file"):
        return web.json_response({"status": "error", "message": "Missing image data."}, status=400)

    abs_path = os.path.abspath(target_path)
    if not os.path.isfile(abs_path):
        return web.json_response({"status": "error", "message": "File not found."}, status=404)

    try:
        ensure_supported_extension(abs_path)
    except ValueError as e:
        return web.json_response({"status": "error", "message": str(e)}, status=400)

    try:
        data_bytes = read_file_field_bytes(file_field)
        with open(abs_path, "wb") as f:
            f.write(data_bytes)
        return web.json_response({"status": "ok", "path": abs_path})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@prompt_server.routes.post("/local_image_gallery/upload")
async def upload_gallery_images(request):
    try:
        data = await request.post()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid form payload."}, status=400)

    directory = data.get("directory")
    if not directory or not isinstance(directory, str):
        return web.json_response({"status": "error", "message": "Missing directory."}, status=400)

    abs_directory = os.path.abspath(directory)
    if not os.path.isdir(abs_directory):
        return web.json_response({"status": "error", "message": "Directory not found."}, status=404)

    file_fields = []
    if hasattr(data, "getall"):
        file_fields = data.getall("image")
    if not file_fields:
        possible = data.get("image")
        if possible:
            file_fields = [possible]

    if not file_fields:
        return web.json_response({"status": "error", "message": "No images provided."}, status=400)

    saved = []
    errors = []

    for file_field in file_fields:
        if not hasattr(file_field, "file"):
            continue
        filename = sanitize_filename(getattr(file_field, "filename", None) or "uploaded.png")
        try:
            ensure_supported_extension(filename)
        except ValueError:
            errors.append(f"{filename}: Unsupported file type.")
            continue

        base, ext = os.path.splitext(filename)
        dest_path = os.path.join(abs_directory, filename)
        counter = 1
        while os.path.exists(dest_path):
            dest_path = os.path.join(abs_directory, f"{base}_{counter}{ext}")
            counter += 1

        try:
            data_bytes = read_file_field_bytes(file_field)
            with open(dest_path, "wb") as f:
                f.write(data_bytes)
            saved.append(dest_path)
        except Exception as e:
            errors.append(f"{filename}: {e}")

    status_code = 200 if saved else 400
    return web.json_response({
        "status": "ok" if saved else "error",
        "saved": saved,
        "errors": errors,
    }, status=status_code)

@prompt_server.routes.get("/local_image_gallery/default_directory")
async def get_default_directory(request):
    return web.json_response({"path": folder_paths.get_input_directory()})

@prompt_server.routes.get("/local_image_gallery/thumbnail")
async def get_thumbnail(request):
    filepath = request.query.get('filepath')
    if not filepath or ".." in filepath: return web.Response(status=400)
    filepath = urllib.parse.unquote(filepath)
    if not os.path.exists(filepath): return web.Response(status=404)
    try:
        img = Image.open(filepath)
        has_alpha = img.mode == 'RGBA' or (img.mode == 'P' and 'transparency' in img.info)
        img = img.convert("RGBA") if has_alpha else img.convert("RGB")
        img.thumbnail([320, 320], Image.LANCZOS)
        buffer = io.BytesIO()
        format, content_type = ('PNG', 'image/png') if has_alpha else ('JPEG', 'image/jpeg')
        img.save(buffer, format=format, quality=90 if format == 'JPEG' else None)
        buffer.seek(0)
        return web.Response(body=buffer.read(), content_type=content_type)
    except Exception as e:
        print(f"LocalImageGallery: Error generating thumbnail for {filepath}: {e}")
        return web.Response(status=500)
@prompt_server.routes.get("/local_image_gallery/view")
async def view_image(request):
    filepath = request.query.get('filepath')
    if not filepath or ".." in filepath: return web.Response(status=400)
    filepath = urllib.parse.unquote(filepath)
    if not os.path.exists(filepath): return web.Response(status=404)
    try: return web.FileResponse(filepath)
    except: return web.Response(status=500)

NODE_CLASS_MAPPINGS = {"SDVN ImageGallery": ImageGallery}
NODE_DISPLAY_NAME_MAPPINGS = {"SDVN ImageGallery": "📂 ImageGallery"}
