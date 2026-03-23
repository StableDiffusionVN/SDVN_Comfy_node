from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
import torch, numpy as np, copy, datetime
import torch.nn.functional as tF
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageColor
import platform, math, folder_paths, os, subprocess, cv2
import torchvision.transforms.functional as F
os_name = platform.system()

def create_image_with_text(text, image_size=(1200, 100), font_size=40, align = "left"):
    image = Image.new('RGB', image_size, color=(255, 255, 255))
    draw = ImageDraw.Draw(image)
    font_size = round(font_size*(image_size[1]/100))
    try:
        if os_name == "Darwin":
            font = ImageFont.truetype("Tahoma.ttf", font_size)
        elif os_name == "Linux":
            #sudo apt install fonts-jetbrains-mono
            font = ImageFont.truetype("JetBrainsMono-Regular.ttf", font_size)
            # font = ImageFont.truetype("LiberationMono-Regular.ttf", font_size)
        else:
            font = ImageFont.truetype("arialbd.ttf", font_size)
    except IOError:
        font = ImageFont.load_default() 

    text_bbox = draw.textbbox((0, 0), text, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]
    if align == "left":
        text_x = 50
    elif align == "center":
        text_x = (image_size[0] - text_width) / 2
    elif align == "right":
        text_x = (image_size[0] - text_width) - 50
    text_y = (image_size[1] - text_height) / 2

    draw.text((text_x, text_y), text, font=font, fill=(0, 0, 0))
    
    return image

def pil2tensor(i) -> torch.Tensor:
    i = ImageOps.exif_transpose(i)
    if i.mode not in ["RGB", "RGBA"]:
        i = i.convert("RGBA")
    image = np.array(i).astype(np.float32) / 255.0
    image = torch.from_numpy(image)[None,]
    return image  # shape: [1, H, W, 3] hoặc [1, H, W, 4]

def tensor2pil(tensor: torch.Tensor) -> Image.Image:
    if tensor.ndim == 3:
        np_image = (tensor.numpy() * 255).astype(np.uint8)
    elif tensor.ndim == 4 and tensor.shape[0] == 1:
        np_image = (tensor.squeeze(0).numpy() * 255).astype(np.uint8)
    else:
        raise ValueError("Tensor phải có shape [H, W, C] hoặc [1, H, W, C]")
    pil_image = Image.fromarray(np_image)
    return pil_image

def _pad_image_hwc(image, target_w, target_h, mode, value=0.0):
    h, w, c = image.shape
    pad_right = max(0, target_w - w)
    pad_bottom = max(0, target_h - h)
    if pad_right == 0 and pad_bottom == 0:
        return image
    if mode == "edge":
        pad_mode = "replicate"
        pad_value = 0.0
    elif mode == "reflect":
        pad_mode = "reflect"
        pad_value = 0.0
    else:
        pad_mode = "constant"
        pad_value = float(value)
    chw = image.permute(2, 0, 1)
    padded = tF.pad(chw, (0, pad_right, 0, pad_bottom), mode=pad_mode, value=pad_value)
    return padded.permute(1, 2, 0)

DEFAULT_OVERLAP = 64

def _align_to_multiple(value, multiple=16, minimum=None):
    value = int(value)
    aligned = max(multiple, ((value + (multiple // 2)) // multiple) * multiple)
    if minimum is not None:
        aligned = max(int(minimum), aligned)
    return aligned

def _resolve_overlap_dims(tile_width, tile_height, overlap):
    overlap = max(0, int(overlap))

    if tile_width >= tile_height:
        overlap_width = overlap
        overlap_height = round(overlap * tile_height / tile_width)
    else:
        overlap_height = overlap
        overlap_width = round(overlap * tile_width / tile_height)

    overlap_width = max(0, min(int(overlap_width), tile_width - 1))
    overlap_height = max(0, min(int(overlap_height), tile_height - 1))
    return overlap_width, overlap_height

def _compute_tile_positions(full_size, tile_size, overlap):
    tile_size = max(1, int(tile_size))
    overlap = max(0, min(int(overlap), tile_size - 1))

    if full_size <= tile_size:
        return [0]

    stride = max(1, tile_size - overlap)
    max_pos = max(0, full_size - tile_size)
    n_tiles = int(math.ceil((full_size - overlap) / stride))
    positions = []
    for index in range(max(1, n_tiles)):
        pos = min(index * stride, max_pos)
        pos = max(0, min(int(pos), max_pos))
        if not positions or pos != positions[-1]:
            positions.append(pos)
    return positions or [0]

def _compute_side_overlaps(positions, tile_size, full_size):
    result = []
    count = len(positions)
    for index, pos in enumerate(positions):
        prev_pos = positions[index - 1] if index > 0 else None
        next_pos = positions[index + 1] if index + 1 < count else None
        left = max(0, (prev_pos + tile_size) - pos) if prev_pos is not None else 0
        right = max(0, (pos + tile_size) - next_pos) if next_pos is not None else 0
        left = min(left, tile_size - 1)
        right = min(right, tile_size - 1)
        if pos <= 0:
            left = 0
        if pos + tile_size >= full_size:
            right = 0
        result.append((left, right))
    return result

def _make_weight_mask(tile_h, tile_w, overlap_left, overlap_right, overlap_top, overlap_bottom, device, dtype):
    if overlap_left <= 0 and overlap_right <= 0 and overlap_top <= 0 and overlap_bottom <= 0:
        return torch.ones((tile_h, tile_w), device=device, dtype=dtype)
    wx = torch.ones(tile_w, device=device, dtype=dtype)
    wy = torch.ones(tile_h, device=device, dtype=dtype)
    overlap_left = min(max(0, int(overlap_left)), tile_w - 1)
    overlap_right = min(max(0, int(overlap_right)), tile_w - 1)
    overlap_top = min(max(0, int(overlap_top)), tile_h - 1)
    overlap_bottom = min(max(0, int(overlap_bottom)), tile_h - 1)
    if overlap_left > 0:
        wx[:overlap_left] = torch.linspace(0.0, 1.0, overlap_left, device=device, dtype=dtype)
    if overlap_right > 0:
        wx[-overlap_right:] = torch.linspace(1.0, 0.0, overlap_right, device=device, dtype=dtype)
    if overlap_top > 0:
        wy[:overlap_top] = torch.linspace(0.0, 1.0, overlap_top, device=device, dtype=dtype)
    if overlap_bottom > 0:
        wy[-overlap_bottom:] = torch.linspace(1.0, 0.0, overlap_bottom, device=device, dtype=dtype)
    return wy[:, None] * wx[None, :]

class SplitTile:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "tile_width": ("INT", {"default": 512, "min": 16, "max": 8192, "step": 16}),
                "tile_height": ("INT", {"default": 512, "min": 16, "max": 8192, "step": 16}),
                "overlap": ("INT", {"default": DEFAULT_OVERLAP, "min": 0, "max": 4096, "step": 8}),
                "force_uniform_tiles": ("BOOLEAN", {"default": True}),
                "pad_mode": (["edge", "reflect", "constant"], {"default": "edge"}),
                "pad_value": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
            }
        }

    OUTPUT_IS_LIST = (True, True)
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE", "TILE_STITCHER")
    RETURN_NAMES = ("tiles", "stitchers")
    FUNCTION = "split"
    DESCRIPTION = "Chia ảnh thành nhiều tile và tạo thông tin để ghép lại."

    def split(self, image, tile_width, tile_height, overlap, force_uniform_tiles, pad_mode, pad_value):
        tile_width = _align_to_multiple(tile_width, multiple=16, minimum=16)
        tile_height = _align_to_multiple(tile_height, multiple=16, minimum=16)
        tiles = []
        stitchers = []
        overlap_width, overlap_height = _resolve_overlap_dims(tile_width, tile_height, overlap)
        for b in range(image.shape[0]):
            img = image[b]
            h, w, c = img.shape
            x_positions = _compute_tile_positions(w, tile_width, overlap_width)
            y_positions = _compute_tile_positions(h, tile_height, overlap_height)
            n_tiles_w = len(x_positions)
            n_tiles_h = len(y_positions)
            max_x = x_positions[-1]
            max_y = y_positions[-1]
            pad_w = max(w, max_x + tile_width)
            pad_h = max(h, max_y + tile_height)
            x_side_overlaps = _compute_side_overlaps(x_positions, tile_width, pad_w)
            y_side_overlaps = _compute_side_overlaps(y_positions, tile_height, pad_h)
            if force_uniform_tiles:
                img_work = _pad_image_hwc(img, pad_w, pad_h, pad_mode, pad_value)
            else:
                img_work = img
                pad_w, pad_h = w, h
            total_tiles = n_tiles_w * n_tiles_h
            index = 0
            for y_i, y in enumerate(y_positions):
                overlap_top, overlap_bottom = y_side_overlaps[y_i]
                for x_i, x in enumerate(x_positions):
                    overlap_left, overlap_right = x_side_overlaps[x_i]
                    if force_uniform_tiles:
                        tile = img_work[y:y + tile_height, x:x + tile_width, :]
                    else:
                        th = min(tile_height, h - y)
                        tw = min(tile_width, w - x)
                        tile = img_work[y:y + th, x:x + tw, :]
                    tiles.append(tile.unsqueeze(0))
                    stitchers.append({
                        "orig_size": (w, h),
                        "canvas_size": (pad_w, pad_h),
                        "tile_size": (tile.shape[2], tile.shape[1]),
                        "overlap_width": overlap_width,
                        "overlap_height": overlap_height,
                        "overlap_left": overlap_left,
                        "overlap_right": overlap_right,
                        "overlap_top": overlap_top,
                        "overlap_bottom": overlap_bottom,
                        "x": x,
                        "y": y,
                        "index": index,
                        "total": total_tiles,
                        "batch_index": b,
                    })
                    index += 1
        return (tiles, stitchers)

class StitchTile:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "tiles": ("IMAGE",),
                "stitchers": ("TILE_STITCHER",),
                "blend": ("BOOLEAN", {"default": True}),
            }
        }

    INPUT_IS_LIST = True
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "stitch"
    DESCRIPTION = "Ghép các tile thành ảnh hoàn chỉnh dựa trên thông tin Stitcher."

    def stitch(self, tiles, stitchers, blend):
        if isinstance(blend, list):
            blend = blend[0]
        if len(tiles) != len(stitchers):
            raise ValueError("Số lượng tiles và stitchers không khớp.")
        groups = {}
        for tile, info in zip(tiles, stitchers):
            b = info.get("batch_index", 0)
            groups.setdefault(b, []).append((tile, info))
        results = []
        for _, items in sorted(groups.items(), key=lambda kv: kv[0]):
            first_info = items[0][1]
            canvas_w, canvas_h = first_info["canvas_size"]
            orig_w, orig_h = first_info["orig_size"]
            device = items[0][0].device
            dtype = items[0][0].dtype
            canvas = torch.zeros((canvas_h, canvas_w, items[0][0].shape[-1]), device=device, dtype=dtype)
            weight = torch.zeros((canvas_h, canvas_w, 1), device=device, dtype=dtype)
            overlap_width = first_info.get("overlap_width")
            overlap_height = first_info.get("overlap_height")
            if overlap_width is None or overlap_height is None:
                overlap = int(first_info.get("overlap", 0))
                overlap_width = overlap
                overlap_height = overlap
            for tile, info in items:
                tile_img = tile[0]
                tile_h, tile_w, _ = tile_img.shape
                x = int(info["x"])
                y = int(info["y"])
                if blend and (overlap_width > 0 or overlap_height > 0):
                    overlap_left = info.get("overlap_left", overlap_width if x > 0 else 0)
                    overlap_right = info.get("overlap_right", overlap_width if x + tile_w < canvas_w else 0)
                    overlap_top = info.get("overlap_top", overlap_height if y > 0 else 0)
                    overlap_bottom = info.get("overlap_bottom", overlap_height if y + tile_h < canvas_h else 0)
                    wmask = _make_weight_mask(
                        tile_h,
                        tile_w,
                        overlap_left,
                        overlap_right,
                        overlap_top,
                        overlap_bottom,
                        device,
                        dtype,
                    )
                else:
                    wmask = torch.ones((tile_h, tile_w), device=device, dtype=dtype)
                wmask = wmask.unsqueeze(-1)
                canvas[y:y + tile_h, x:x + tile_w, :] += tile_img * wmask
                weight[y:y + tile_h, x:x + tile_w, :] += wmask
            weight = torch.clamp(weight, min=1e-6)
            merged = canvas / weight
            merged = merged[:orig_h, :orig_w, :]
            results.append(merged.unsqueeze(0))
        return (torch.cat(results, dim=0),)

class img_list_repeat:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "image1": ("IMAGE",),
                "image2": ("IMAGE",),
                "image3": ("IMAGE",),
                "image4": ("IMAGE",),
                "image5": ("IMAGE",),
                "image6": ("IMAGE",),
                "image7": ("IMAGE",),
                "image8": ("IMAGE",),
                "image9": ("IMAGE",),
                "image10": ("IMAGE",),
            }
        }
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True, )
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "list_img"
    DESCRIPTION = "Ghép các ảnh đầu vào thành một danh sách."
    OUTPUT_TOOLTIPS = ("Danh sách ảnh kết quả.",)

    def list_img(s, image1 = None, image2 = None, image3 = None, image4 = None, image5 = None, image6 = None, image7 = None, image8 = None, image9 = None, image10 = None):
        r = []
        for i in [image1, image2, image3, image4, image5, image6, image7, image8, image9, image10]:
            if i != None:
                if isinstance(i, list):
                    r += [*i]
                else:
                    r += [i]
        return (r,)

class img_repeat:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "repeat": ("INT", {"default":1,"min":1}),
                "image": ("IMAGE",),
            }
        }
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True, )
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "list_img"
    DESCRIPTION = "Lặp lại danh sách ảnh nhiều lần."
    OUTPUT_TOOLTIPS = ("Danh sách ảnh sau khi lặp.",)

    def list_img(s, repeat, image):
        r = []
        for _ in range(repeat[0]):
            r += [*image]
        return (r,)

class load_img_from_list:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "index": ("INT", {"default":0,"min":0}),
                "image": ("IMAGE",),
            }
        }
    INPUT_IS_LIST = True
    # OUTPUT_IS_LIST = (True, )
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "load_from_list"
    DESCRIPTION = "Lấy một ảnh từ danh sách theo chỉ số."
    OUTPUT_TOOLTIPS = ("Ảnh được chọn.",)

    def load_from_list(s, index, image):
        return (image[index[0]],)
       
class image_layout:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "mode": (["row","column","auto"],),
                "max_size": ("INT",{"default":1024,"min":0}),
                "label": ("STRING",),
                "font_size": ("INT",{"default":40,"min":0}),
                "align": (["left","center","right"],),
            },
            "optional": {
                "image1": ("IMAGE",),
                "image2": ("IMAGE",),
                "image3": ("IMAGE",),
                "image4": ("IMAGE",),
                "image5": ("IMAGE",),
                "image6": ("IMAGE",),
            }
        }
    INPUT_IS_LIST = True
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "layout"

    def layout(self, mode, max_size, label, align, font_size, image1 = None, image2 = None, image3 = None, image4 = None, image5 = None, image6 = None):
        list_img = []
        full_img = []
        mode = mode[0]
        max_size = max_size[0]
        align = align[0]
        font_size = font_size[0]
        for i in [image1, image2, image3, image4, image5, image6]:
            if i != None and i != [None]:
                if isinstance(i, list):
                    full_img += [*i]
                else:
                    full_img += [i]
        full_img = [RGBAtoRGB().RGBAtoRGB(i)[0] for i in full_img]
        if mode != "auto":
            for i in full_img:
                samples = i.movedim(-1, 1)
                w = samples.shape[3]
                h = samples.shape[2]
                if mode == "row":
                    w = round(w * max_size / h)
                    h = max_size
                elif mode == "column":
                    h = round(h * max_size / w)
                    w = max_size
                i = ALL_NODE["ImageScale"]().upscale(i, "nearest-exact", w, h, "disabled")[0]
                list_img.append(i)
            if mode == "row":
                if len(label) == 1:
                    label = label[0].split(',')
                if len(label) > 1:
                    new_list = []
                    for index in range(len(list_img)):
                        try:
                            r_label = label[index].strip()
                        except:
                            r_label = " "
                        new_list += [self.layout(["row"], [max_size], [r_label], [align], [font_size], [list_img[index]])[0]]
                    list_img = new_list
                list_img = [tensor.squeeze(0) for tensor in list_img]
                img_layout = torch.cat(list_img, dim=1)
            elif mode == "column":
                list_img = [tensor.squeeze(0) for tensor in list_img]
                img_layout = torch.cat(list_img, dim=0)
            r = img_layout.unsqueeze(0)
        else:
            c = math.ceil(math.sqrt(len(full_img)))
            if len(full_img) % c <= c/2 and len(full_img) % c != 0:
                c = c + 1
            new_list = [full_img[i:i + c] for i in range(0, len(full_img), c)]
            for i in new_list:
                list_img += [self.layout(["row"], [max_size], [""], ["left"], [font_size], i)[0]]
            if len(list_img) >1:
                r = self.layout(["column"], [max_size], [""], ["left"], [font_size], list_img)[0]
            else:
                r = list_img[0]
        if ( mode != "row") or ( len(label) == 1 and mode == "row" and ',' not in label[0]):
            label = label[0]
            if label != "":
                samples = r.movedim(-1, 1)
                w = samples.shape[3]
                h = samples.shape[2]
                img_label = create_image_with_text(label, image_size=(w, round(50 * (h / 512))), font_size = font_size, align = align)
                img_label = pil2tensor(img_label)
                list_img = [r, img_label]
                list_img = [tensor.squeeze(0) for tensor in list_img]
                img_layout = torch.cat(list_img, dim=0)
                r = img_layout.unsqueeze(0)
        return (r,)

class img_scraper:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "url": ("STRING", {"default":"","multiline": False}),
                "custom_save_folder": ("STRING",),
                "save_folder": (["input","output"],),
                "cookies": (["chrome","firefox"],),
            }
        }
    OUTPUT_NODE = True
    OUTPUT_IS_LIST = (True, )
    CATEGORY = "📂 SDVN/👨🏻‍💻 Dev"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "img_scraper"

    def img_scraper(s, url, custom_save_folder, save_folder, cookies):
        url = url.split('?')[0]
        if custom_save_folder == "":
            main_folder = folder_paths.get_input_directory() if save_folder == "input" else folder_paths.get_output_directory()
        else:
            main_folder = custom_save_folder
        sub_folder = url.split('//')[-1].split('/')[0].split('www.')[-1]
        folder = os.path.join(main_folder,sub_folder)
        command = ["gallery-dl", "--cookies-from-browser", cookies, "--directory", folder, url]
        subprocess.run(command, check=True,text=True, capture_output=True)
        result = ALL_NODE["SDVN Load Image Folder"]().load_image(folder, -1, False, 0)["result"][0]
        return (result,)

class film_grain:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (["Film grain", "Gaussian noise"],),
                "weight": ("INT",{"default":0,"min":0,"max":100,"display":"slider","round": 1,"lazy": True}),
            }
        }
    
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "film_grain"

    def film_grain(s, image, mode, weight):
        intensity = weight/500
        if mode == "Film grain":
            grain = torch.empty_like(image).uniform_(-intensity, intensity)
            r = torch.clamp(image + grain, 0, 1)
        if mode == "Gaussian noise":
            mean = 0.0
            noise = torch.randn_like(image) * intensity + mean
            r = torch.clamp(image + noise, 0, 1)
        return (r,)

class white_balance:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "temp": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
                "tint": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
            }
        }
    
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "white_balance"

    def white_balance(s, image, temp, tint):
        temp_adjustment = torch.tensor([1.0 + temp * 0.01, 1.0, 1.0 - temp * 0.01], device=image.device)
        tint_adjustment = torch.tensor([1.0 + tint * 0.01, 1.0 - tint * 0.01, 1.0], device=image.device)
        image = image * temp_adjustment * tint_adjustment
        image = torch.clamp(image, 0, 1)
        return (image,)

class img_adj:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "exposure": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
                "contrast": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
                "saturation": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
                "vibrance": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
                "temp": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
                "tint": ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True}),
                "grain": ("INT",{"default":0,"min":0,"max":100,"display":"slider","round": 1,"lazy": True}),
            }
        }
    
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "img_adj"

    def img_adj(s, image, exposure, contrast, saturation, vibrance, grain, temp, tint):
        exposure = exposure/100
        contrast = contrast/100 + 1
        saturation = saturation/100 + 1
        vibrance = vibrance/100
        intensity = grain/500
        image = image.permute(0, 3, 1, 2).squeeze(0)

        image = torch.clamp(image + exposure, 0, 1)
        image = F.adjust_contrast(image, contrast)
        image = F.adjust_saturation(image, saturation)
        vibrance_factor = (image - torch.mean(image, dim=0, keepdim=True)) * vibrance
        image = torch.clamp(image + vibrance_factor, 0, 1)
        grain = torch.empty_like(image).uniform_(-intensity, intensity)
        image = torch.clamp(image + grain, 0, 1)

        image = image.permute(1, 2, 0).unsqueeze(0)

        if temp != 0 or tint != 0:
            temp_adjustment = torch.tensor([1.0 + temp * 0.01, 1.0, 1.0 - temp * 0.01], device=image.device)
            tint_adjustment = torch.tensor([1.0 + tint * 0.01, 1.0 - tint * 0.01, 1.0], device=image.device)
            image = image * temp_adjustment * tint_adjustment
            image = torch.clamp(image, 0, 1)
        
        return (image,)

COLOR_RANGES = {
    "all": [(0,180)],
    "red": [(0, 10), (160, 180)],
    "orange": [(10, 25)],
    "yellow": [(25, 35)],
    "green": [(35, 85)],
    "aqua": [(85, 100)],
    "blue": [(100, 130)],
    "purple": [(130, 145)],
    "magenta": [(145, 160)],
}

class hls_adj:
    @classmethod
    def INPUT_TYPES(s):
        r = {"image": ("IMAGE",)}
        for i in COLOR_RANGES:
            r[f"{i}_hue"] = ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True})
            r[f"{i}_saturation"] = ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True})
            r[f"{i}_lightness"] = ("INT",{"default":0,"min":-100,"max":100,"display":"slider","round": 1,"lazy": True})
        return {
            "required": r
        }
    
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "hls_adj"

    def hls(s, pil_image, color, hue, saturation, lightness):
        hue = hue/10
        saturation = saturation/100 + 1
        lightness = lightness/1000 + 1
        image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        image_hls = cv2.cvtColor(image, cv2.COLOR_BGR2HLS)
        mask = np.zeros(image_hls.shape[:2], dtype=np.uint8)
        for lower, upper in COLOR_RANGES[color]:
            lower_bound = np.array([lower, 0, 0])
            upper_bound = np.array([upper, 255, 255])
            color_mask = cv2.inRange(image_hls, lower_bound, upper_bound)
            mask = cv2.bitwise_or(mask, color_mask)

        h, l, s = cv2.split(image_hls)
        h = np.where(mask > 0, (h + hue) % 180, h)
        s = np.where(mask > 0, np.clip(s * saturation, 0, 255), s)
        l = np.where(mask > 0, np.clip(l * lightness, 0, 255), l)

        h = h.astype('uint8')
        l = l.astype('uint8')
        s = s.astype('uint8')
        adjusted_hls = cv2.merge([h, l, s])
        adjusted_image = cv2.cvtColor(adjusted_hls, cv2.COLOR_HLS2BGR)
        pil_img =  Image.fromarray(cv2.cvtColor(adjusted_image, cv2.COLOR_BGR2RGB))
        return pil_img
    
    def hls_adj(self, image, **kargs):
        pil_image = tensor2pil(image)
        for i in kargs:
            if "hue" in i:
                color = i.split("_")[0]
                if kargs[f"{color}_hue"] !=0 or  kargs[f"{color}_saturation"] !=0 or  kargs[f"{color}_lightness"] !=0:
                    h, s, l = [kargs[f"{color}_hue"], kargs[f"{color}_saturation"], kargs[f"{color}_lightness"]]
                    pil_image = self.hls(pil_image, color, h, s, l)
        r = pil2tensor(pil_image)
        return (r,)

class FlipImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),  
                "flip_direction": (["horizontal", "vertical"], {"default": "horizontal"}),
            }
        }

    CATEGORY = "📂 SDVN/🏞️ Image" 
    RETURN_TYPES = ("IMAGE",)  
    RETURN_NAMES = ("flipped_image",)  
    FUNCTION = "flip_image" 

    def flip_image(self, image, flip_direction):
        pil_image = tensor2pil(image)

        if flip_direction == "horizontal":
            flipped_image = pil_image.transpose(Image.FLIP_LEFT_RIGHT)
        else:
            flipped_image = pil_image.transpose(Image.FLIP_TOP_BOTTOM)
        flipped_tensor = pil2tensor(flipped_image)
        return (flipped_tensor,)

class FillBackground:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",), 
                "background_color": ("STRING", {"default": "#FFFFFF"}),
            }
        }

    CATEGORY = "📂 SDVN/🏞️ Image" 
    RETURN_TYPES = ("IMAGE",) 
    RETURN_NAMES = ("filled_image",)  
    FUNCTION = "fill_background" 

    def fill_background(self, image, background_color):
        pil_image = tensor2pil(image)
        try:
            bg_color = self.hex_to_rgb(background_color)
        except ValueError as e:
            print(f"Invalid HEX color: {e}. Using white as default.")
            bg_color = (255, 255, 255)
        filled_image = self.fill_transparent_background(pil_image, bg_color)

        filled_tensor = pil2tensor(filled_image)
        return (filled_tensor,)

    def hex_to_rgb(self, hex_color):
        hex_color = hex_color.lstrip('#')
        if len(hex_color) != 6:
            raise ValueError("HEX color must be in format '#RRGGBB'")
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def fill_transparent_background(self, pil_image, bg_color):
        if pil_image.mode in ('RGBA', 'LA') or (pil_image.mode == 'P' and 'transparency' in pil_image.info):
            background = Image.new("RGB", pil_image.size, bg_color)
            background.paste(pil_image, mask=pil_image.split()[-1])
            return background
        else:
            return Image.new("RGB", pil_image.size, bg_color)

    def overlay_color(self, pil_image, bg_color):
        background = Image.new("RGB", pil_image.size, bg_color)

        if pil_image.mode in ('RGBA', 'LA') or (pil_image.mode == 'P' and 'transparency' in pil_image.info):
            background.paste(pil_image, mask=pil_image.split()[-1])
        else:
            background.paste(pil_image)

        return background

class ICLora_layout:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image1": ("IMAGE",),  
                "image2": ("IMAGE",),    
                "height_size": ("INT", {"default": 1024, "min": 512, "max": 2048, "step": 1})
                },
            "optional":{
                "mask1": ("MASK",),    
                "mask2": ("MASK",),  
            }
        }

    CATEGORY = "📂 SDVN/🏞️ Image"  
    RETURN_TYPES = ("IMAGE", "MASK", "CROP", "CROP") 
    RETURN_NAMES = ("ic_layout", "mask_layout", "crop_image1", "crop_image2") 
    FUNCTION = "ICLora_layout"  

    def ICLora_layout(self, image1, image2, height_size, mask1 = None, mask2 = None):
        img_layout, n_w1, n_w2 = self.layout(image1,image2,height_size)
        if mask1 != None:
            mask1 = ALL_NODE["MaskToImage"]().mask_to_image(mask1)[0]
        else:
            mask1 = torch.zeros(1, height_size, n_w1, 3)
        if mask2 != None:
            mask2 = ALL_NODE["MaskToImage"]().mask_to_image(mask2)[0]
        else:
            mask2 = torch.zeros(1, height_size, n_w2, 3)
        mask_layout = self.layout(mask1,mask2,height_size)[0]
        mask_layout = ALL_NODE["ImageToMask"]().image_to_mask(mask_layout,"red")[0]
        return (img_layout, mask_layout, [n_w1,height_size,0,0], [n_w2,height_size,n_w1,0])
    
    def layout (self, image1, image2, h):
        w1 = image1.movedim(-1, 1).shape[3]
        h1 = image1.movedim(-1, 1).shape[2]
        w2 = image2.movedim(-1, 1).shape[3]
        h2 = image2.movedim(-1, 1).shape[2]
        n_w1 = round(w1 * h / h1)
        n_w2 = round(w2 * h / h2)
        img1 = ALL_NODE["ImageScale"]().upscale(image1, "nearest-exact", n_w1, h, "disabled")[0].squeeze(0)
        img2 = ALL_NODE["ImageScale"]().upscale(image2, "nearest-exact", n_w2, h, "disabled")[0].squeeze(0)
        img_layout = torch.cat([img1,img2], dim=1).unsqueeze(0)
        return (img_layout, n_w1, n_w2)

class ICLora_Layout_Crop:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),   
                "crop": ("CROP",),  
                }}
    CATEGORY = "📂 SDVN/🏞️ Image"  
    RETURN_TYPES = ("IMAGE",) 
    RETURN_NAMES = ("image",) 
    FUNCTION = "ICLora_Layout_Crop" 

    def ICLora_Layout_Crop(s, crop, image):
        return (ALL_NODE["ImageCrop"]().crop(image, *crop)[0],)

class CropByRatio:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "ratio": (["None","1:1", "4:5", "5:4", "2:3", "3:2", "16:9", "9:16", "1:2", "2:1",],),
                "position": ([
                    "top-left", "top-mid", "top-right",
                    "center-left", "center-mid", "center-right",
                    "bottom-left", "bottom-mid", "bottom-right"
                ],)
            }
        }

    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("cropped_image",)
    FUNCTION = "crop_image"

    def crop_image(self, image, ratio, position):
        if ratio == "None":
            return (image,)
        b, h, w, c = image.shape

        # Tính khích thước crop theo tỉ lệ
        rw, rh = map(int, ratio.split(":"))
        target_aspect = rw / rh
        image_aspect = w / h

        if image_aspect > target_aspect:
            crop_h = h
            crop_w = int(h * target_aspect)
        else:
            crop_w = w
            crop_h = int(w / target_aspect)

        # Vị trí crop
        vertical, horizontal = position.split("-")

        if horizontal == "left":
            x1 = 0
        elif horizontal == "mid":
            x1 = (w - crop_w) // 2
        else:  # right
            x1 = w - crop_w

        if vertical == "top":
            y1 = 0
        elif vertical == "center":
            y1 = (h - crop_h) // 2
        else:  # bottom
            y1 = h - crop_h

        x2 = x1 + crop_w
        y2 = y1 + crop_h

        cropped = image[:, y1:y2, x1:x2, :]
        return (cropped,)

class EmptyLatentRatio:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ratio": (["1:1", "4:5", "5:4", "2:3", "3:2", "16:9", "9:16", "1:2", "2:1",],),
                "maxsize": ("INT", {"default": 1024, "min": 0, "max": 4096, "step": 1, }),
            }
        }

    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("latent",)
    FUNCTION = "EmptyLatentRatio"

    def EmptyLatentRatio(self, ratio, maxsize):
        w,h = map(int, ratio.split(":"))
        if w > h:
            h = round(maxsize * h / w)
            w = maxsize
        else:
            w = round(maxsize * w / h)
            h = maxsize
        latent = ALL_NODE["EmptyLatentImage"]().generate(w,h,1)[0]
        return (latent,)


class RGBAtoRGB:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
            }
        }
    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "RGBAtoRGB"

    def RGBAtoRGB(s, image):
        if image.shape[-1] == 4:
            image = image[..., :3]
        return (image,)


class OverlayImages:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image1": ("IMAGE",),  # Hình đè lên
                "image2": ("IMAGE",),  # Hình nền
                "opacity": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0}),
            }
        }

    CATEGORY = "📂 SDVN/🎨 Image Processing"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("output_image",)
    FUNCTION = "overlay_images"

    def overlay_images(self, image1, image2, opacity):
        pil1 = tensor2pil(image1).convert("RGBA")
        pil2 = tensor2pil(image2).convert("RGBA")

        pil1 = pil1.resize(pil2.size, Image.BICUBIC)

        # Nếu pil1 đã có alpha riêng, ta nhân alpha hiện tại với độ mờ đầu vào
        r1, g1, b1, a1 = pil1.split()
        a1 = a1.point(lambda x: int(x * opacity))
        pil1 = Image.merge("RGBA", (r1, g1, b1, a1))

        output = Image.alpha_composite(pil2, pil1)
        return (pil2tensor(output),)

class MaskToTransparentColor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
                "color_hex": ("STRING", {"default": "#FF0000"}),
            }
        }

    CATEGORY = "📂 SDVN/🎨 Image Processing"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("rgba_image",)
    FUNCTION = "convert"

    def convert(self, mask, color_hex):
        mask_tensor = mask[0]
        mask_np = mask_tensor.squeeze().cpu().numpy()
        h, w = mask_np.shape

        color_rgb = self.hex_to_rgb(color_hex)

        rgba = np.zeros((h, w, 4), dtype=np.uint8)
        rgba[..., :3] = color_rgb
        rgba[..., 3] = (mask_np * 255).astype(np.uint8)

        image = Image.fromarray(rgba, mode="RGBA")
        return (pil2tensor(image),)
    
    def hex_to_rgb(self, hex_color):
        hex_color = hex_color.strip().lstrip('#')
        if len(hex_color) != 6:
            raise ValueError("HEX color must be in format '#RRGGBB'")
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

class OverlayMaskWithHexColor(OverlayImages, MaskToTransparentColor):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "base_image": ("IMAGE",),
                "mask": ("MASK",),
                "color_hex": ("STRING", {"default": "#FF0000"}),
                "opacity": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0}),
            }
        }

    CATEGORY = "📂 SDVN/🎨 Image Processing"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "overlay_mask"

    def overlay_mask(self, mask, base_image, color_hex, opacity):
        colored_mask = self.convert(mask, color_hex)[0]
        return self.overlay_images(colored_mask, base_image, opacity)

class SaveImageCompare:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Ảnh đầu tiên sẽ được lưu ra thư mục output."}),
                "filename_prefix": ("STRING", {"default": "SDVN", "tooltip": "Tiền tố tên file, hỗ trợ cú pháp %dd (ngày), %mm (tháng), %yy (năm), %w (chiều rộng), %h (chiều cao), %maxsize (kích thước lớn nhất)."}),
            },
            "optional": {
                "compare_image": ("IMAGE", {"tooltip": "Ảnh thứ hai (không lưu) để tạo khung so sánh."}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    CATEGORY = "📂 SDVN/🏞️ Image"
    RETURN_TYPES = ()
    FUNCTION = "save_and_compare"
    OUTPUT_NODE = True
    DESCRIPTION = "Lưu ảnh đầu tiên và (nếu có) tạo khung so sánh với ảnh thứ hai."

    def _format_prefix(self, prefix, image):
        if not isinstance(prefix, str) or "%" not in prefix:
            return prefix
        sample = None
        if isinstance(image, torch.Tensor):
            if image.ndim == 4:
                sample = image[0]
            elif image.ndim == 3:
                sample = image
        if sample is not None and sample.ndim >= 2:
            height = int(sample.shape[0])
            width = int(sample.shape[1]) if sample.ndim >= 2 else 0
        else:
            width = 0
            height = 0
        maxsize = max(width, height)
        replacements = {
            "%dd": lambda: str(datetime.datetime.now().day).zfill(2),
            "%mm": lambda: str(datetime.datetime.now().month).zfill(2),
            "%yy": lambda: str(datetime.datetime.now().year),
            "%w": lambda: str(width),
            "%h": lambda: str(height),
            "%maxsize": lambda: str(maxsize),
        }
        result = prefix
        for token, fn in replacements.items():
            if token in result:
                result = result.replace(token, fn())
        return result

    def save_and_compare(self, image, filename_prefix="SDVN", compare_image=None, prompt=None, extra_pnginfo=None):
        filename_prefix = self._format_prefix(filename_prefix, image)
        save_node = ALL_NODE["SaveImage"]()
        save_result = save_node.save_images(image, filename_prefix, prompt, extra_pnginfo) or {"ui": {}}

        if compare_image is not None:
            comparer = ALL_NODE["PreviewImage"]()
            preview = comparer.save_images(compare_image, f"{filename_prefix}_compare", prompt, extra_pnginfo) or {"ui": {}}
            original_images = copy.deepcopy(save_result.get("ui", {}).get("images", []) or [])
            compare_images = copy.deepcopy(preview.get("ui", {}).get("images", []) or [])

            save_result.setdefault("ui", {})
            save_result["ui"]["images"] = copy.deepcopy(original_images)
            save_result["ui"]["a_images"] = original_images
            save_result["ui"]["b_images"] = compare_images

        return save_result
    
NODE_CLASS_MAPPINGS = {
    "SDVN Image Scraper": img_scraper,
    "SDVM Image List Repeat": img_list_repeat,
    "SDVN Image Repeat": img_repeat,
    "SDVN Load Image From List": load_img_from_list,
    "SDVN Image Layout": image_layout,
    "SDVN Image Film Grain": film_grain,
    "SDVN Image White Balance": white_balance,
    "SDVN Image Adjust": img_adj,
    "SDVN Image HSL": hls_adj,
    "SDVN Flip Image": FlipImage,
    "SDVN Fill Background": FillBackground,
    "SDVN IC Lora Layout": ICLora_layout,
    "SDVN IC Lora Layout Crop": ICLora_Layout_Crop,
    "SDVN Crop By Ratio": CropByRatio,
    "SDVN RGBA to RGB": RGBAtoRGB,
    "SDVN Empty Latent Ratio": EmptyLatentRatio,
    "SDVN Overlay Images": OverlayImages,
    "SDVN Mask To Transparent Color": MaskToTransparentColor,
    "SDVN Overlay Mask Color Image": OverlayMaskWithHexColor,
    "SDVN Split Tile": SplitTile,
    "SDVN Stitch Tile": StitchTile,
    "SDVN Save Image": SaveImageCompare,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Image Scraper": "⏬️ Image Scraper",
    "SDVM Image List Repeat": "🔄 Image List",
    "SDVN Image Repeat": "🔄 Image Repeat",
    "SDVN Load Image From List": "📁 Image From List",
    "SDVN Image Layout": "🪄 Image Layout",
    "SDVN Image Film Grain": "🪄 Film Grain",
    "SDVN Image White Balance": "🪄 White Balance",
    "SDVN Image Adjust": "🪄 Image Adjust",
    "SDVN Image HSL": "🪄 HSL Adjust",
    "SDVN Flip Image": "🔄 Flip Image",
    "SDVN Fill Background": "🎨 Fill Background",
    "SDVN IC Lora Layout": "🧩 IC Lora Layout",
    "SDVN IC Lora Layout Crop": "✂️ IC Lora Layout Crop",
    "SDVN Crop By Ratio": "✂️ Crop By Ratio",
    "SDVN RGBA to RGB": "🔄 RGBA to RGB",
    "SDVN Empty Latent Ratio": "⚡️ Empty Latent Ratio",
    "SDVN Overlay Images": "🧅 Overlay Two Images",
    "SDVN Mask To Transparent Color": "🎭 Mask → Transparent Color",
    "SDVN Overlay Mask Color Image": "🧩 Overlay Mask",
    "SDVN Split Tile": "🧩 Split Tile",
    "SDVN Stitch Tile": "🧩 Stitch Tile",
    "SDVN Save Image": "💾 Save Image + Compare",
}
