from threading import Event
import time

import torch
import torch.nn.functional as F
from aiohttp import web

from comfy import model_management as mm
from comfy_execution.graph import ExecutionBlocker
from nodes import PreviewImage
from server import PromptServer


class SDVNChooserCancelled(Exception):
    pass


def get_chooser_cache():
    if not hasattr(PromptServer.instance, "_sdvn_image_chooser_node"):
        PromptServer.instance._sdvn_image_chooser_node = {}
    return PromptServer.instance._sdvn_image_chooser_node


def cleanup_session_data(node_id):
    node_data = get_chooser_cache()
    if node_id in node_data:
        for key in ("event", "selected", "images", "total_count", "cancelled"):
            node_data[node_id].pop(key, None)


def _downscale_for_preview(image: torch.Tensor, scale: float) -> torch.Tensor:
    if scale >= 0.999 or scale <= 0:
        return image
    batch = image.movedim(-1, 1)
    height = max(1, round(batch.shape[-2] * scale))
    width = max(1, round(batch.shape[-1] * scale))
    batch = F.interpolate(batch, size=(height, width), mode="bilinear", align_corners=False)
    return batch.movedim(1, -1)


def wait_for_chooser(node_id, image_list, mode, period=0.1):
    try:
        node_data = get_chooser_cache()

        if mode == "First":
            return {"result": ([image_list[0]] if image_list else ExecutionBlocker(None),)}

        if mode == "Last":
            if node_id in node_data and "last_selection" in node_data[node_id]:
                last_selection = node_data[node_id]["last_selection"]
                valid_indices = [idx for idx in last_selection if 0 <= idx < len(image_list)]
                if valid_indices:
                    selected_images = [image_list[idx] for idx in valid_indices]
                    return {"result": (selected_images,)}
            return {"result": ([image_list[-1]] if image_list else ExecutionBlocker(None),)}

        if node_id in node_data:
            del node_data[node_id]

        event = Event()
        node_data[node_id] = {
            "event": event,
            "images": image_list,
            "selected": None,
            "total_count": len(image_list),
            "cancelled": False,
        }

        while node_id in node_data:
            node_info = node_data[node_id]
            if node_info.get("cancelled", False):
                cleanup_session_data(node_id)
                raise SDVNChooserCancelled("Manual selection cancelled")
            if node_info.get("selected") is not None:
                break
            time.sleep(period)

        if node_id not in node_data:
            return {"result": (image_list[0] if image_list else ExecutionBlocker(None),)}

        node_info = node_data[node_id]
        selected_indices = node_info.get("selected") or []
        valid_indices = [idx for idx in selected_indices if 0 <= idx < len(image_list)]
        if valid_indices:
            node_data[node_id]["last_selection"] = valid_indices
            selected_images = [image_list[idx] for idx in valid_indices]
            cleanup_session_data(node_id)
            return {"result": (selected_images,)}

        cleanup_session_data(node_id)
        return {"result": (image_list[0] if image_list else ExecutionBlocker(None),)}
    except SDVNChooserCancelled:
        raise mm.InterruptProcessingException()
    except Exception:
        node_data = get_chooser_cache()
        if node_id in node_data:
            cleanup_session_data(node_id)
        return {"result": ([image_list[0]] if image_list else ExecutionBlocker(None),)}


@PromptServer.instance.routes.post("/sdvn/image_chooser_message")
async def handle_sdvn_image_selection(request):
    try:
        data = await request.json()
        node_id = data.get("node_id")
        selected = data.get("selected", [])
        action = data.get("action")

        node_data = get_chooser_cache()
        if node_id not in node_data:
            return web.json_response({"code": -1, "error": "Node data does not exist"})

        node_info = node_data[node_id]
        if "total_count" not in node_info:
            return web.json_response({"code": -1, "error": "The node has been processed"})

        if action == "cancel":
            node_info["cancelled"] = True
            node_info["selected"] = []
        elif action == "select" and isinstance(selected, list):
            valid_indices = [idx for idx in selected if isinstance(idx, int) and 0 <= idx < node_info["total_count"]]
            if not valid_indices:
                return web.json_response({"code": -1, "error": "Invalid selection index"})
            node_info["selected"] = valid_indices
            node_info["cancelled"] = False
        else:
            return web.json_response({"code": -1, "error": "Invalid operation"})

        node_info["event"].set()
        return web.json_response({"code": 1})
    except Exception:
        return web.json_response({"code": -1, "error": "Request failed"})


class SDVNImageChooser(PreviewImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (["Choose", "Last", "First"], {"default": "Choose"}),
                "preview_rescale": ("FLOAT", {"default": 1.0, "min": 0.05, "max": 1.0, "step": 0.05}),
            },
            "optional": {
                "images": ("IMAGE",),
            },
            "hidden": {
                "prompt": "PROMPT",
                "my_unique_id": "UNIQUE_ID",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "chooser"
    OUTPUT_NODE = True
    INPUT_IS_LIST = True
    CATEGORY = "📂 SDVN/🏞️ Image"

    def chooser(self, prompt=None, my_unique_id=None, extra_pnginfo=None, **kwargs):
        node_id = my_unique_id[0]
        node_id = node_id.split(".")[-1] if "." in node_id else node_id

        image_batches = kwargs.pop("images", None)
        if image_batches is None:
            return ([torch.zeros(1, 1, 1, 3)],)

        image_list = []
        for batch in image_batches:
            for index in range(batch.shape[0]):
                image_list.append(batch[index : index + 1, ...])

        mode_value = kwargs.pop("mode", ["Choose"])
        mode = mode_value[0] if isinstance(mode_value, list) else mode_value
        preview_rescale_value = kwargs.pop("preview_rescale", [1.0])
        preview_rescale = preview_rescale_value[0] if isinstance(preview_rescale_value, list) else preview_rescale_value

        if mode != "Choose":
            return wait_for_chooser(node_id, image_list, mode)

        try:
            pnginfo = extra_pnginfo[0]
        except Exception:
            pnginfo = None

        urls = []
        for image in image_list:
            preview_image = _downscale_for_preview(image, float(preview_rescale))
            result = self.save_images(images=preview_image, prompt=prompt, extra_pnginfo=pnginfo)
            urls.extend(result.get("ui", {}).get("images", []))
        try:
            PromptServer.instance.send_sync("sdvn-image-choose", {"id": node_id, "urls": urls})
        except Exception:
            pass

        return wait_for_chooser(node_id, image_list, mode)


NODE_CLASS_MAPPINGS = {
    "SDVN Image Chooser": SDVNImageChooser,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Image Chooser": "💡Image Chooser",
}
