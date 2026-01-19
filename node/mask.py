from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
import folder_paths
import os
import numpy as np
import torch
from PIL import Image, ImageOps
from torch.hub import download_url_to_file
import torch.nn.functional as FF

yolo_model_list = ["face_yolov8n-seg2_60.pt", "face_yolov8m-seg_60.pt",
                    "skin_yolov8n-seg_800.pt", "skin_yolov8n-seg_400.pt", "skin_yolov8m-seg_400.pt",
                    "yolov8_butterfly_custom.pt", "yolo-human-parse-epoch-125.pt", "yolo-human-parse-v2.pt",
                    "hair_yolov8n-seg_60.pt", "flowers_seg_yolov8model.pt", "facial_features_yolo8x-seg.pt", "Anime-yolov8-seg.pt",
                    "yolov8x-seg.pt", "yolov8s-seg.pt", "yolov8n-seg.pt", "yolov8m-seg.pt", "yolov8l-seg.pt",
                    "yolo11s-seg.pt", "yolo11n-seg.pt", "yolo11m-seg.pt", "yolo11l-seg.pt", "yolo11x-seg.pt",
                    "yolo11l-pose.pt", "yolo11s-pose.pt", "yolo11x-pose.pt", "yolo11s.pt", "yolo11l.pt", "yolo11x.pt"
                    ]

base_url = "https://huggingface.co/StableDiffusionVN/yolo/resolve/main/"

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
        model_folder = s.yolo_dir
        model_path = os.path.join(model_folder, model_name)
        if not os.path.exists(model_folder):
            os.makedirs(model_folder)
        if not os.path.exists(model_path):
            url = base_url + model_name
            download_url_to_file(url, model_path)
        try:
            model = YOLO(model_path)
        except Exception as e:
            if "weights_only" in str(e) or "SegmentationModel" in str(e):
                from ultralytics.nn.tasks import SegmentationModel
                torch.serialization.add_safe_globals({'SegmentationModel': SegmentationModel})
                model = YOLO(model_path)
            else:
                raise e
        input = image
        image = tensor2pil(image.to(model.device))
        conf = score
        classes = [int(x.strip()) for x in id.split(",")] if id.strip() != "" else []
        r = model(image, classes = None if len(classes) == 0 else classes, conf = conf)[0]

        for key, value in r.names.items():
            r.names[key] = f"{key} - {value}"
        id_list = [v for _ , v in r.names.items()]
        id_list = '\n'.join(id_list)
        id_box = r.boxes.cls.int().tolist()
        num_objects = len(id_box)
        image = Image.fromarray(r.plot()[..., ::-1])
        image = pil2tensor(image)
        if len(id_box) > 0 and r.masks is not None:
            mask = r.masks.data
            mask = torch.sum(mask, dim=0, keepdim=True)
            mask = FF.interpolate(mask.unsqueeze(0),
                size=(image.shape[1], image.shape[2]), mode='bilinear', align_corners=False).squeeze(0)
            invert_mask = (1.0 - mask).to(image.device)
            alpha_image = ALL_NODE["JoinImageWithAlpha"]().execute(input, invert_mask)[0]
            ui = ALL_NODE["PreviewImage"]().save_images(alpha_image)["ui"]
        else:
            mask = torch.zeros((1, 64, 64), dtype=torch.float32)
            ui = ALL_NODE["PreviewImage"]().save_images(image)["ui"]

        return {"ui":ui, "result": (image, mask.cpu(), id_list, num_objects)}
       
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
        regions_sorted = sorted(regions, key=s.get_top_left_coords)

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
                "target_size":("BOOLEAN", {"default": False, "tooltip": "Giữ kích thước đầu ra giống đầu vào"}),
            },
            "optional": {
                "mask": ("MASK", {"tooltip": "Mask đầu vào"}),
            }
        }

    CATEGORY = "📂 SDVN/🎭 Mask"
    RETURN_TYPES = ("STITCHER", "IMAGE", "MASK")
    RETURN_NAMES = ("stitcher", "cropped_image", "cropped_mask")
    FUNCTION = "inpaint"

    def inpaint_crop(self, image,crop_size, extend, target_size, mask = None):
        if mask is not None:
            if ALL_NODE["SDVN Get Mask Size"]().get_size(mask)[0] == 0:
                mask = None
        if image.shape[-1] == 4:
            image = image[..., :3]
        if "InpaintCropImproved" not in ALL_NODE:
            raise Exception("Install node InpaintCrop and update (https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch)")
        input = ALL_NODE["InpaintCropImproved"]().inpaint_crop(image, "bilinear", "bicubic", False, "ensure minimum resolution", 1024, 1024, 16384, 16384, False, 1, 1, 1, 1, 0.1, True, 0, False, 32, extend, target_size, crop_size, crop_size, 32, "gpu (much faster)", mask, None)
        input[0]["mask"] = mask
        input[0]["crop_size"] = crop_size
        input[0]["extend"] = extend
        return input
    
    def inpaint (s, image, crop_size, extend, mask = None):
        result = s.inpaint_crop(image, crop_size, extend,  mask)
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
            image = ALL_NODE["InpaintStitchImproved"]().inpaint_stitch(stitchers[stit_index], inpainted_image)[0]
            index += 1
            if index < len(inpainted_images):
                stit_index = index if index <= len(stitchers) - 1 else len(stitchers) - 1
                canva = ALL_NODE["SDVN Inpaint Crop"]().inpaint_crop(image,  stitchers[stit_index]["crop_size"], stitchers[stit_index]["extend"], stitchers[stit_index]["mask"])[0]["canvas_image"]
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
        mask_tensor = mask[0]  # shape: [1, H, W]
        binary_mask = (mask_tensor > 0.5).squeeze(0)  # [H, W]
        coords = binary_mask.nonzero(as_tuple=False)
        if coords.numel() == 0:
            return (0, 0)
        y_min, x_min = coords.min(dim=0).values
        y_max, x_max = coords.max(dim=0).values
        width = (x_max - x_min + 1).item()
        height = (y_max - y_min + 1).item()
        return (width, height)

NODE_CLASS_MAPPINGS = {
    "SDVN Yolo8 Seg": yoloseg,
    "SDVN Mask Regions": MaskRegions,
    "SDVN Inpaint Crop": inpaint_crop,
    "SDVN Loop Inpaint Stitch": LoopInpaintStitch,
    "SDVN Get Mask Size": GetMaskSize,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Yolo8 Seg": "🎭 Yolo Seg Mask",
    "SDVN Mask Regions": "🧩 Mask Regions",
    "SDVN Inpaint Crop": "⚡️ Crop Inpaint",
    "SDVN Loop Inpaint Stitch": "🔄 Loop Inpaint Stitch",
    "SDVN Get Mask Size": "📐 Mask Size",
}