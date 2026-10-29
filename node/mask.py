from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
import folder_paths
import os
import numpy as np
from scipy import ndimage
import torch
from PIL import Image, ImageOps
from torch.hub import download_url_to_file
import torch.nn.functional as FF
import comfy.model_management
from .inpaint_cropandstitch import InpaintCropImproved, InpaintStitchImproved

yolo_model_list = ["face_yolov8n-seg2_60.pt", "face_yolov8m-seg_60.pt",
                    "skin_yolov8n-seg_800.pt", "skin_yolov8n-seg_400.pt", "skin_yolov8m-seg_400.pt",
                    "yolov8_butterfly_custom.pt", "yolo-human-parse-epoch-125.pt", "yolo-human-parse-v2.pt",
                    "hair_yolov8n-seg_60.pt", "flowers_seg_yolov8model.pt", "facial_features_yolo8x-seg.pt", "Anime-yolov8-seg.pt",
                    "yolov8x-seg.pt", "yolov8s-seg.pt", "yolov8n-seg.pt", "yolov8m-seg.pt", "yolov8l-seg.pt",
                    "yolo11s-seg.pt", "yolo11n-seg.pt", "yolo11m-seg.pt", "yolo11l-seg.pt", "yolo11x-seg.pt",
                    "yolo11l-pose.pt", "yolo11s-pose.pt", "yolo11x-pose.pt", "yolo11s.pt", "yolo11l.pt", "yolo11x.pt"
                    ]

yolo26_model_urls = {
    f"yolo26{size}-seg.pt": f"https://huggingface.co/Ultralytics/YOLO26/resolve/main/yolo26{size}-seg.pt"
    for size in ("n", "s", "m", "l", "x")
}
yolo_model_list.extend(yolo26_model_urls)

base_url = "https://huggingface.co/StableDiffusionVN/yolo/resolve/main/"

def pil2tensor(i) -> torch.Tensor:
    i = ImageOps.exif_transpose(i)
    if i.mode not in ["RGB", "RGBA"]:
        i = i.convert("RGBA")
    image = np.array(i).astype(np.float32) / 255.0
    image = torch.from_numpy(image)[None,]
    return image  # shape: [1, H, W, 3] hoặc [1, H, W, 4]

def tensor2pil(tensor: torch.Tensor) -> Image.Image:
    tensor = tensor.detach().cpu().clamp(0, 1)
    if tensor.ndim == 3:
        np_image = (tensor.numpy() * 255).astype(np.uint8)
    elif tensor.ndim == 4 and tensor.shape[0] == 1:
        np_image = (tensor.squeeze(0).numpy() * 255).astype(np.uint8)
    else:
        raise ValueError("Tensor phải có shape [H, W, C] hoặc [1, H, W, C]")
    pil_image = Image.fromarray(np_image)
    return pil_image

class yoloseg:

    yolo_dir = os.path.join(folder_paths.models_dir, "yolo")
    file_list = []
    if os.path.exists(yolo_dir):
        for file in os.listdir(yolo_dir):
            file_full_path = os.path.join(yolo_dir, file)
            if os.path.isfile(file_full_path):
                type_name = file.split('.')[-1].lower()
                if type_name in ["pt"]:
                    file_list.append(file)
    model_list = list(set(yolo_model_list + file_list))
    model_list.sort()

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Ảnh đầu vào"}),
                "model_name": (s.model_list, {"default": "face_yolov8n-seg2_60.pt", "tooltip": "Tên mô hình YOLO"}),
                "score": ("FLOAT", {"default": 0.6, "min": 0.01, "max": 1.0, "step": 0.01, "tooltip": "Ngưỡng điểm"},),
                "id": ("STRING", {"default": "", "tooltip": "Lọc ID đối tượng"}),
            },
        }
    
    CATEGORY = "📂 SDVN/🎭 Mask"
    FUNCTION = "yoloseg"
    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "INT")
    RETURN_NAMES = ("image", "mask", "all_id", "num_objects")
    DESCRIPTION = "Tạo mask bằng mô hình YOLO." 
    OUTPUT_TOOLTIPS = (
        "Ảnh với vùng phát hiện",
        "Mask vùng phát hiện",
        "Danh sách ID đối tượng",
        "Số lượng đối tượng",
    )

    def yoloseg(s, image, model_name, score, id):
        from ultralytics import YOLO

        if model_name not in s.model_list:
            raise ValueError(f"Model YOLO không có trong danh sách: {model_name!r}")
        model_path = os.path.join(s.yolo_dir, model_name)
        if not os.path.isfile(model_path):
            if model_name not in yolo_model_list:
                raise FileNotFoundError(f"Không tìm thấy model YOLO: {model_path}")
            os.makedirs(s.yolo_dir, exist_ok=True)
            url = yolo26_model_urls.get(model_name, base_url + model_name)
            download_url_to_file(url, model_path)
        model = YOLO(model_path)
        classes = [int(x.strip()) for x in id.split(",")] if id.strip() else None
        id_list = '\n'.join(f"{key} - {value}" for key, value in model.names.items())
        rgb_images = image[..., :3]
        sources = [tensor2pil(item) for item in rgb_images]
        device = str(comfy.model_management.get_torch_device())
        results = model.predict(sources, classes=classes, conf=score, device=device,
                                retina_masks=True, stream=True, verbose=False)
        output_images, output_masks = [], []
        num_objects = 0
        for result in results:
            num_objects += len(result.boxes) if result.boxes is not None else 0
            result.names = {key: f"{key} - {value}" for key, value in result.names.items()}
            output_images.append(pil2tensor(Image.fromarray(result.plot()[..., ::-1])))
            if result.masks is not None and result.masks.data.shape[0] > 0:
                mask = result.masks.data.amax(dim=0, keepdim=True).float().clamp(0, 1)
                if mask.shape[-2:] != image.shape[1:3]:
                    mask = FF.interpolate(mask.unsqueeze(1), size=image.shape[1:3],
                                          mode='bilinear', align_corners=False).squeeze(1)
                output_masks.append(mask.cpu())
            else:
                output_masks.append(None)

        has_masks = any(mask is not None for mask in output_masks)
        mask_size = image.shape[1:3] if has_masks else (64, 64)
        masks = torch.cat([mask if mask is not None else torch.zeros((1, *mask_size), dtype=torch.float32)
                           for mask in output_masks], dim=0)
        images = torch.cat(output_images, dim=0)
        if has_masks:
            alpha_image = ALL_NODE["JoinImageWithAlpha"]().execute(rgb_images.cpu(), 1.0 - masks)[0]
            ui = ALL_NODE["PreviewImage"]().save_images(alpha_image)["ui"]
        else:
            ui = ALL_NODE["PreviewImage"]().save_images(images)["ui"]
        return {"ui": ui, "result": (images, masks, id_list, num_objects)}

class GrowMask:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "mask": ("MASK",),
            "expand": ("INT", {"default": 0, "min": -16384, "max": 16384, "step": 1,
                                "tooltip": "Số dương mở rộng, số âm thu nhỏ (pixel)."}),
            "direction": (["all", "top", "bottom", "left", "right", "top_left", "top_right",
                           "bottom_left", "bottom_right", "custom"], {"default": "all"}),
            "angle": ("FLOAT", {"default": 90.0, "min": 0.0, "max": 360.0, "step": 1.0,
                                 "tooltip": "Chỉ dùng với custom: 0° phải, 90° dưới, 180° trái, 270° trên."}),
            "tapered_corners": ("BOOLEAN", {"default": True}),
        }}

    CATEGORY = "📂 SDVN/🎭 Mask"
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("mask",)
    FUNCTION = "grow_mask"
    DESCRIPTION = "Mở rộng/thu nhỏ mask đều hoặc tăng dần theo hướng chọn, giữ nguyên phía đối diện."

    def grow_mask(self, mask, expand, direction="all", angle=90.0, tapered_corners=True):
        angles = {"right": 0, "bottom_right": 45, "bottom": 90, "bottom_left": 135,
                  "left": 180, "top_left": 225, "top": 270, "top_right": 315}
        radians = np.deg2rad(angle if direction == "custom" else angles.get(direction, 0))
        dx, dy = np.cos(radians), np.sin(radians)
        dx = 0.0 if abs(dx) < 1e-10 else dx
        dy = 0.0 if abs(dy) < 1e-10 else dy
        c = 0 if tapered_corners else 1
        kernel = np.array([[c, 1, c], [1, 1, 1], [c, 1, c]])
        operation = ndimage.grey_dilation if expand > 0 else ndimage.grey_erosion
        masks = mask.reshape(-1, *mask.shape[-2:])
        outputs = []
        for item in masks:
            original = item.detach().to(device="cpu", dtype=torch.float32).numpy()
            current = original.copy()
            result = original.copy()
            radius = None
            if direction != "all":
                ys, xs = np.nonzero(original > 0)
                if not len(ys):
                    outputs.append(result)
                    continue
                # Project the mask bounds onto the chosen direction; opposite edge stays at zero.
                projection = xs * dx + ys * dy
                low, high = projection.min(), projection.max()
                y, x = np.ogrid[:original.shape[0], :original.shape[1]]
                radius = np.clip((x * dx + y * dy - low) / max(high - low, 1), 0, 1) * abs(expand)
            for step in range(1, abs(expand) + 1):
                previous = current
                current = operation(current, footprint=kernel)
                if radius is None:
                    result = current
                else:
                    weight = np.clip(radius - (step - 1), 0, 1)
                    result += (current - previous) * weight
                if np.array_equal(current, previous):
                    break
            outputs.append(result)
        output = torch.from_numpy(np.stack(outputs)).to(device=mask.device, dtype=mask.dtype)
        return (output,)


class MaskRegions:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK", {"tooltip": "Mask cần tách"}), 
            }
        }

    CATEGORY = "📂 SDVN/🎭 Mask"
    RETURN_TYPES = ("MASK",)
    RETURN_NAMES = ("layer_mask",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "separate_regions"
    DESCRIPTION = "Tách mask thành từng vùng riêng biệt."
    OUTPUT_TOOLTIPS = ("Danh sách mask vùng.",)

    @staticmethod
    def get_top_left_coords(tensor):
        coords = (tensor > 0).nonzero(as_tuple=False)
        if coords.numel() == 0:
            return (99999, 99999) 
        _, y, x = coords.min(dim=0).values
        return (x.item(), y.item()) 
    
    def separate_regions(s, mask):
        threshold = 0.3
        mask_bin = (mask > threshold).float()
        mask_np = mask_bin.squeeze().cpu().numpy().astype(np.uint8)

        import cv2
        n_labels, labels = cv2.connectedComponents(mask_np)
        regions = []
        for i in range(1, n_labels):
            region = (labels == i).astype(np.float32)
            region_tensor = torch.from_numpy(region).to(mask.device).unsqueeze(0)
            regions.append(region_tensor)

        # Filter lớn
        def is_large_enough(region):
            coords = (region > 0).nonzero(as_tuple=False)
            if coords.numel() == 0:
                return False
            y_min, x_min = coords.min(dim=0).values[1:]
            y_max, x_max = coords.max(dim=0).values[1:]
            return (y_max - y_min + 1 > 50) and (x_max - x_min + 1 > 50)
        
        regions = [r for r in regions if is_large_enough(r)]

        def region_area(region):
            return float(region.sum().item())

        regions_sorted = sorted(
            regions,
            key=lambda r: (region_area(r), s.get_top_left_coords(r)),
            reverse=True,
        )

        # Nếu không tìm thấy vùng nào, trả về một mask mặc định 64x64 toàn 0
        if len(regions_sorted) == 0:
            zero_mask = torch.zeros((1, 64, 64), dtype=torch.float32, device=mask.device)
            return ([zero_mask],)

        return (regions_sorted,)

class inpaint_crop:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "image": ("IMAGE",),
                "crop_size": ([512,768,896,1024,1280,1408,1536,1664,1792,1920,2048], {"default": 1024}),
                "extend": ("FLOAT", {"default": 1.2, "min": 0, "max": 100}),
                "target_size":("BOOLEAN", {"default": True, "tooltip": "Giữ kích thước đầu ra giống đầu vào"}),
            },
            "optional": {
                "mask": ("MASK", {"tooltip": "Mask đầu vào"}),
            }
        }

    CATEGORY = "📂 SDVN/🎭 Mask"
    RETURN_TYPES = ("STITCHER", "IMAGE", "MASK")
    RETURN_NAMES = ("stitcher", "cropped_image", "cropped_mask")
    FUNCTION = "inpaint"

    def inpaint_crop(self, image, crop_size, extend, target_size, mask = None):
        if mask is not None:
            img_h, img_w = image.shape[1], image.shape[2]
            mask_h, mask_w = mask.shape[-2], mask.shape[-1]
            if mask_h != img_h or mask_w != img_w:
                mask = FF.interpolate(mask.unsqueeze(1).float(), size=(img_h, img_w), mode='bilinear', align_corners=False).squeeze(1)
            if ALL_NODE["SDVN Get Mask Size"]().get_size(mask)[0] == 0:
                mask = None
        if image.shape[-1] == 4:
            image = image[..., :3]
        input = InpaintCropImproved().inpaint_crop(image, "bilinear", "bicubic", False, "ensure minimum resolution", 1024, 1024, 16384, 16384, False, 1, 1, 1, 1, 0.1, True, 0, False, 32, extend, target_size, crop_size, crop_size, 32, "gpu (much faster)", mask, None)
        input[0]["mask"] = mask
        input[0]["crop_size"] = crop_size
        input[0]["extend"] = extend
        input[0]["target_size"] = target_size
        return input
    
    def inpaint (s, image, crop_size, extend, target_size, mask = None):
        result = s.inpaint_crop(image, crop_size, extend,  target_size, mask)
        image = result[1]
        mask_out = result[2]
        if mask is not None:
            invert_mask = 1.0 - mask_out
            alpha_image = ALL_NODE["JoinImageWithAlpha"]().execute(image, invert_mask)[0]
            ui = ALL_NODE["PreviewImage"]().save_images(alpha_image)["ui"]
        else:
            ui = ALL_NODE["PreviewImage"]().save_images(image)["ui"]
        return {"ui":ui, "result": result}
    
class LoopInpaintStitch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "stitchers": ("STITCHER",),
                "inpainted_images": ("IMAGE",),
            }
        }

    CATEGORY = "📂 SDVN/🎭 Mask"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "inpaint_stitch"
    INPUT_IS_LIST = True

    def inpaint_stitch(self, stitchers, inpainted_images):
        canva = stitchers[0]['canvas_image']
        index = 0
        stit_index = 0
        for inpainted_image in inpainted_images:
            print(f'Vòng lặp {index}')
            stitchers[stit_index]['canvas_image'] = canva
            image = InpaintStitchImproved().inpaint_stitch(stitchers[stit_index], inpainted_image)[0]
            index += 1
            if index < len(inpainted_images):
                stit_index = index if index <= len(stitchers) - 1 else len(stitchers) - 1
                canva = ALL_NODE["SDVN Inpaint Crop"]().inpaint_crop(image, stitchers[stit_index]["crop_size"], stitchers[stit_index]["extend"], stitchers[stit_index].get("target_size", True), stitchers[stit_index]["mask"])[0]["canvas_image"]
        return (image,)
    
class GetMaskSize:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mask": ("MASK",),
            }
        }

    CATEGORY = "📂 SDVN/🎭 Mask"
    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "get_size"

    def get_size(self, mask):
        binary_mask = mask > 0.5
        if binary_mask.ndim == 3:
            binary_mask = binary_mask.any(dim=0)
        coords = binary_mask.nonzero(as_tuple=False)
        if coords.numel() == 0:
            return (0, 0)
        y_min, x_min = coords.min(dim=0).values
        y_max, x_max = coords.max(dim=0).values
        width = (x_max - x_min + 1).item()
        height = (y_max - y_min + 1).item()
        return (width, height)


class MaskColorOverlay:
    """Resize a mask to the image size and blend a chosen color through it."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {"tooltip": "Ảnh gốc cần phủ màu"}),
                "mask": ("MASK", {"tooltip": "Mask xác định vùng phủ màu"}),
                "color_hex": ("STRING", {"default": "#FF0000", "tooltip": "Màu phủ dạng HEX, ví dụ #FF0000"}),
                "opacity": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "tooltip": "Độ đậm của lớp màu"}),
            }
        }

    CATEGORY = "📂 SDVN/🎭 Mask"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "overlay_mask"
    DESCRIPTION = "Tự đổi kích thước mask theo ảnh rồi phủ màu lên vùng mask."
    OUTPUT_TOOLTIPS = ("Ảnh gốc sau khi phủ màu theo mask.",)

    def overlay_mask(self, image, mask, color_hex, opacity):
        color_hex = color_hex.strip().lstrip("#")
        if len(color_hex) != 6:
            raise ValueError("Màu phải có định dạng HEX #RRGGBB.")
        try:
            color = [int(color_hex[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
        except ValueError as exc:
            raise ValueError("Màu phải có định dạng HEX #RRGGBB.") from exc

        image_height, image_width = image.shape[1:3]
        mask = mask.to(device=image.device, dtype=torch.float32)
        if mask.ndim == 2:
            mask = mask.unsqueeze(0)
        if mask.ndim != 3:
            raise ValueError("Mask phải có shape [H, W] hoặc [B, H, W].")

        if mask.shape[-2:] != (image_height, image_width):
            mask = FF.interpolate(
                mask.unsqueeze(1),
                size=(image_height, image_width),
                mode="bilinear",
                align_corners=False,
            ).squeeze(1)

        image_batch, mask_batch = image.shape[0], mask.shape[0]
        if mask_batch == 1 and image_batch > 1:
            mask = mask.expand(image_batch, -1, -1)
        elif image_batch == 1 and mask_batch > 1:
            image = image.expand(mask_batch, -1, -1, -1)
        elif image_batch != mask_batch:
            raise ValueError(
                f"Số batch của ảnh ({image_batch}) và mask ({mask_batch}) phải bằng nhau hoặc bằng 1."
            )

        channels = image.shape[-1]
        if channels not in (3, 4):
            raise ValueError("Ảnh đầu vào cần có 3 kênh RGB hoặc 4 kênh RGBA.")

        alpha = (mask.clamp(0.0, 1.0) * float(opacity)).unsqueeze(-1)
        color_tensor = torch.tensor(color, device=image.device, dtype=image.dtype).view(1, 1, 1, 3)
        rgb = image[..., :3] * (1.0 - alpha) + color_tensor * alpha
        if channels == 4:
            output = torch.cat((rgb, image[..., 3:4]), dim=-1)
        else:
            output = rgb
        return (output.clamp(0.0, 1.0),)

NODE_CLASS_MAPPINGS = {
    "SDVN Yolo8 Seg": yoloseg,
    "SDVN Grow Mask": GrowMask,
    "SDVN Mask Regions": MaskRegions,
    "SDVN Inpaint Crop": inpaint_crop,
    "SDVN Loop Inpaint Stitch": LoopInpaintStitch,
    "SDVN Get Mask Size": GetMaskSize,
    "SDVN Mask Color Overlay": MaskColorOverlay,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Yolo8 Seg": "🎭 Yolo Seg Mask",
    "SDVN Grow Mask": "🎭 Grow Mask",
    "SDVN Mask Regions": "🧩 Mask Regions",
    "SDVN Inpaint Crop": "⚡️ Crop Inpaint",
    "SDVN Loop Inpaint Stitch": "🔄 Loop Inpaint Stitch",
    "SDVN Get Mask Size": "📐 Mask Size",
    "SDVN Mask Color Overlay": "🎨 Mask Color Overlay",
}
