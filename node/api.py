from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
from google import genai
from openai import OpenAI
import io, base64, torch, numpy as np, re, os, json, ast, inspect, textwrap, folder_paths
import mimetypes
from typing import Callable, Any
from googletrans import LANGUAGES
from PIL import Image, ImageOps
from google.genai import types
from io import BytesIO
from comfy_api_nodes.util.conversions import audio_to_base64_string, video_to_base64_string
import server
from aiohttp import web
from .style_store import (
    delete_custom_style,
    load_custom_styles,
    load_default_styles,
    save_custom_style,
    style_names,
)

prompt_server = server.PromptServer.instance

DEFAULT_FUNCTION_TEMPLATE = textwrap.dedent("""\
def function(input_value, extra_value=None):
    "Example helper that trims text and optionally appends extra info."
    if input_value is None:
        return "No input provided"

    result = str(input_value).strip()
    if extra_value:
        result = f"{result} | extra: {extra_value}"
    return result
""").strip()


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

def pil_to_bytesio(image, filename="image.png"):
    image = tensor2pil(image)
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    buffer.name = filename
    return buffer

def mask_bytesio(mask, filename="mask_alpha.png"):
    mask_img = mask.reshape((-1, 1, mask.shape[-2], mask.shape[-1])).movedim(1, -1).expand(-1, -1, -1, 3)
    mask_img = tensor2pil(mask_img)
    mask = ImageOps.invert(mask_img.convert("L"))
    mask_rgba = mask.convert("RGBA")
    mask_rgba.putalpha(mask)
    buffer = BytesIO()
    mask_rgba.save(buffer, format="PNG")
    buffer.seek(0)
    buffer.name = filename  
    return buffer

def lang_list():
    lang_list = ["None"]
    for i in LANGUAGES.items():
        lang_list += [i[1]]
    return lang_list

class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __eq__(self, _) -> bool:
        return True

    def __ne__(self, __value: object) -> bool:
        return False


any = AnyType("*")

def api_check():
    api_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"API_key.json")
    if os.path.exists(api_file):
        with open(api_file, 'r', encoding='utf-8') as f:
            api_list = json.load(f)
        return api_list
    else:
        return None

def tensor2pil(tensor: torch.Tensor) -> Image.Image:
    if tensor.ndim == 4:
        tensor = tensor.squeeze(0)
    if tensor.ndim == 3 and tensor.shape[-1] == 3:
        np_image = (tensor.numpy() * 255).astype(np.uint8)
    else:
        raise ValueError(
            "Tensor phải có shape [H, W, C] hoặc [1, H, W, C] với C = 3 (RGB).")
    pil_image = Image.fromarray(np_image)
    return pil_image


def encode_image(image_tensor):
    image = tensor2pil(image_tensor)
    with io.BytesIO() as image_buffer:
        image.save(image_buffer, format="PNG")
        image_buffer.seek(0)
        encoded_image = base64.b64encode(image_buffer.read()).decode('utf-8')

    return encoded_image


class run_python_code:
    @staticmethod
    def _load_function(function_source: str) -> Callable[..., Any]:
        code = textwrap.dedent(function_source or "").strip()
        if not code:
            raise RuntimeError("Không có mã Python để thực thi. Hãy mở Setting và nhập hàm.")

        try:
            module_ast = ast.parse(code, mode="exec")
        except SyntaxError as exc:
            raise RuntimeError(f"Mã Python không hợp lệ: {exc}") from exc

        target_name = None
        for node in module_ast.body:
            if isinstance(node, ast.FunctionDef):
                target_name = node.name
                if node.name == "function":
                    break
        if target_name is None:
            raise RuntimeError("Không tìm thấy hàm nào trong đoạn mã. Tạo ít nhất một hàm với từ khóa def.")

        compiled = compile(module_ast, filename="<SDVN Run Python Code>", mode="exec")
        local_context: dict[str, Any] = {}
        exec(compiled, {}, local_context)
        func = local_context.get(target_name)
        if not callable(func):
            raise RuntimeError(f"Đối tượng '{target_name}' không phải là hàm callable.")
        return func

    @staticmethod
    def _invoke_function(func: Callable[..., Any], *raw_inputs: Any) -> Any:
        provided = [value for value in raw_inputs if value is not None]
        if not provided:
            return func()

        if len(provided) == 1:
            only_value = provided[0]
            if isinstance(only_value, dict):
                try:
                    return func(**only_value)
                except TypeError:
                    pass
            if isinstance(only_value, (list, tuple)):
                try:
                    return func(*only_value)
                except TypeError:
                    pass

        try:
            return func(*provided)
        except TypeError as exc:
            try:
                signature = inspect.signature(func)
            except (ValueError, TypeError):  # pragma: no cover - fallback when signature is unavailable
                signature = "không xác định"
            raise RuntimeError(
                f"Không thể gọi hàm '{func.__name__}' với {len(provided)} tham số. Signature mong đợi: {signature}"
            ) from exc

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "function": (
                    "STRING",
                    {
                        "default": DEFAULT_FUNCTION_TEMPLATE,
                        "multiline": True,
                        "tooltip": "Hàm Python cần thực thi",
                    },
                )
            },
            "optional": {
                "input": (any, {"tooltip": "Tham số 1"}),
                "input2": (any, {"tooltip": "Tham số 2"}),
                "input3": (any, {"tooltip": "Tham số 3"}),
            },
        }

    CATEGORY = "📂 SDVN/👨🏻‍💻 Dev"
    OUTPUT_IS_LIST = (True,)
    RETURN_TYPES = (any,)
    RETURN_NAMES = ("output",)
    FUNCTION = "python_function"
    DESCRIPTION = "Chạy đoạn mã Python tùy chọn."
    OUTPUT_TOOLTIPS = ("Kết quả thực thi.",)

    def python_function(self, function, input=None, input2=None, input3=None):
        highlight_msg = "Bạn đang sử dụng workflow độc quyền được thiết kế bởi Phạm Hưng, truy cập hungdiffusion.com để ủng hộ tác giả và nhận những hỗ trợ tốt nhất"
        print(f"\033[43m\033[30m {highlight_msg} \033[0m")
        try:
            user_function = self._load_function(function)
            output = self._invoke_function(user_function, input, input2, input3)
        except Exception as exc:
            raise RuntimeError(f"Run Python Code error: {exc}") from exc

        if not isinstance(output, list):
            output = [output]
        return ([*output],)

model_list = {
    "Gemini | 3.1 Flash Lite": "gemini-3.1-flash-lite-preview",
    "Gemini | 2.5 Flash": "gemini-2.5-flash",
    "Gemini | 2.5 Flash Lite": "gemini-2.5-flash-lite",
    "Gemini | 2.5 Pro": "gemini-2.5-pro",
    "Gemini | 3 Flash": "gemini-3-flash-preview",
    "Gemini | 3 Pro": "gemini-3.1-pro-preview",
    "OpenAI | GPT 5": "gpt-5",
    "OpenAI | GPT 5-mini": "gpt-5-mini",
    "OpenAI | GPT 5-nano": "gpt-5-nano",
    "Deepseek | R1": "deepseek-chat",
}

DEFAULT_PRESET_PROMPTS = {
    "None": [],
    "Python Function": [
        {"role": "user", "content": "I will ask for a def python function with any task, give me the answer that python function, write simply, and don't need any other instructions, the imports are placed in the function. For input or output requirements of an image, remember the image is in tensor form"},
        {"role": "assistant", "content": "Agree! Please submit your request."}
    ],
    "Prompt Generate": [
        {"role": "user", "content": "Send the description on demand, limit 100 words, only send me the answer" }
    ]
}

GEMINI_MAX_INPUT_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
CHATBOT_PRESET_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "chatbot_presets.json")
IMAGE_PRESET_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gemini_image_presets.json")


def normalize_preset_messages(messages):
    if not isinstance(messages, list):
        raise ValueError("Preset phải là một danh sách messages.")
    normalized_messages = []
    for item in messages:
        if not isinstance(item, dict):
            raise ValueError("Mỗi message preset phải là object.")
        role = str(item.get("role", "")).strip()
        content = str(item.get("content", "")).strip()
        if not role or not content:
            raise ValueError("Mỗi message preset phải có role và content.")
        normalized_messages.append({"role": role, "content": content})
    return normalized_messages


def normalize_custom_preset_text(value):
    text = str(value or "").strip()
    if not text:
        raise ValueError("Nội dung preset không được để trống.")
    return text


def preset_value_to_messages(value):
    if isinstance(value, list):
        return normalize_preset_messages(value)
    return [{"role": "user", "content": normalize_custom_preset_text(value)}]


def load_custom_chatbot_presets():
    if not os.path.exists(CHATBOT_PRESET_FILE):
        return {}
    try:
        with open(CHATBOT_PRESET_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}

    if not isinstance(data, dict):
        return {}

    presets = {}
    for name, value in data.items():
        preset_name = str(name).strip()
        if not preset_name or preset_name in DEFAULT_PRESET_PROMPTS:
            continue
        try:
            presets[preset_name] = normalize_custom_preset_text(value)
        except ValueError:
            continue
    return presets


def save_custom_chatbot_presets(presets):
    with open(CHATBOT_PRESET_FILE, "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)


def get_all_chatbot_presets():
    custom_presets = load_custom_chatbot_presets()
    combined = dict(DEFAULT_PRESET_PROMPTS)
    for name, value in custom_presets.items():
        combined[name] = preset_value_to_messages(value)
    return combined


def chatbot_preset_list():
    return list(DEFAULT_PRESET_PROMPTS.keys()) + list(load_custom_chatbot_presets().keys())


DEFAULT_IMAGE_PRESETS = {"None": ""}


def load_custom_image_presets():
    if not os.path.exists(IMAGE_PRESET_FILE):
        return {}
    try:
        with open(IMAGE_PRESET_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}

    if not isinstance(data, dict):
        return {}

    presets = {}
    for name, value in data.items():
        preset_name = str(name).strip()
        if not preset_name or preset_name in DEFAULT_IMAGE_PRESETS:
            continue
        try:
            presets[preset_name] = normalize_custom_preset_text(value)
        except ValueError:
            continue
    return presets


def save_custom_image_presets(presets):
    with open(IMAGE_PRESET_FILE, "w", encoding="utf-8") as f:
        json.dump(presets, f, ensure_ascii=False, indent=2)


def image_preset_list():
    return list(DEFAULT_IMAGE_PRESETS.keys()) + list(load_custom_image_presets().keys())


def style_widget_list():
    return ["None"] + style_names()


def get_image_preset_text(preset_name):
    custom_presets = load_custom_image_presets()
    if preset_name in custom_presets:
        return custom_presets[preset_name]
    return DEFAULT_IMAGE_PRESETS.get(preset_name, "")


def merge_image_preset_prompt(prompt, preset_name):
    preset_text = get_image_preset_text(preset_name)
    return f"{preset_text}\n\n{prompt}".strip() if preset_text else prompt


def with_node_preview(result_tuple, image_tensor, show_preview):
    if not show_preview:
        return result_tuple
    ui = ALL_NODE["PreviewImage"]().save_images(image_tensor)["ui"]
    return {"ui": ui, "result": result_tuple}


@prompt_server.routes.get("/sdvn/chatbot_presets")
async def sdvn_get_chatbot_presets(request):
    custom_presets = load_custom_chatbot_presets()
    return web.json_response(
        {
            "defaults": DEFAULT_PRESET_PROMPTS,
            "custom": custom_presets,
            "names": list(DEFAULT_PRESET_PROMPTS.keys()) + list(custom_presets.keys()),
        }
    )


@prompt_server.routes.post("/sdvn/chatbot_presets/save")
async def sdvn_save_chatbot_preset(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid JSON payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    previous_name = str(payload.get("previous_name", "")).strip()
    content = payload.get("content", "")

    if not name:
        return web.json_response({"status": "error", "message": "Tên preset không được để trống."}, status=400)
    if name in DEFAULT_PRESET_PROMPTS:
        return web.json_response({"status": "error", "message": "Tên preset trùng preset mặc định."}, status=400)

    try:
        normalized_content = normalize_custom_preset_text(content)
    except ValueError as exc:
        return web.json_response({"status": "error", "message": str(exc)}, status=400)

    custom_presets = load_custom_chatbot_presets()
    if previous_name and previous_name not in DEFAULT_PRESET_PROMPTS and previous_name != name:
        custom_presets.pop(previous_name, None)
    custom_presets[name] = normalized_content
    save_custom_chatbot_presets(custom_presets)

    return web.json_response(
        {
            "status": "ok",
            "name": name,
            "custom": custom_presets,
            "names": list(DEFAULT_PRESET_PROMPTS.keys()) + list(custom_presets.keys()),
        }
    )


@prompt_server.routes.post("/sdvn/chatbot_presets/delete")
async def sdvn_delete_chatbot_preset(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid JSON payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    if not name:
        return web.json_response({"status": "error", "message": "Thiếu tên preset."}, status=400)
    if name in DEFAULT_PRESET_PROMPTS:
        return web.json_response({"status": "error", "message": "Không thể xóa preset mặc định."}, status=400)

    custom_presets = load_custom_chatbot_presets()
    if name not in custom_presets:
        return web.json_response({"status": "error", "message": "Preset không tồn tại."}, status=404)

    custom_presets.pop(name, None)
    save_custom_chatbot_presets(custom_presets)
    return web.json_response(
        {
            "status": "ok",
            "custom": custom_presets,
            "names": list(DEFAULT_PRESET_PROMPTS.keys()) + list(custom_presets.keys()),
        }
    )


@prompt_server.routes.get("/sdvn/gemini_image_presets")
async def sdvn_get_gemini_image_presets(request):
    custom_presets = load_custom_image_presets()
    return web.json_response(
        {
            "defaults": DEFAULT_IMAGE_PRESETS,
            "custom": custom_presets,
            "names": list(DEFAULT_IMAGE_PRESETS.keys()) + list(custom_presets.keys()),
        }
    )


@prompt_server.routes.get("/sdvn/styles")
async def sdvn_get_styles(request):
    default_styles = load_default_styles()
    custom_styles = load_custom_styles()
    return web.json_response(
        {
            "defaults": default_styles,
            "custom": custom_styles,
            "names": style_widget_list(),
        }
    )


@prompt_server.routes.post("/sdvn/styles/save")
async def sdvn_save_style(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid JSON payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    previous_name = str(payload.get("previous_name", "")).strip()
    positive_prompt = payload.get("positive_prompt", "")
    negative_prompt = payload.get("negative_prompt", "")

    try:
        custom_styles = save_custom_style(name, positive_prompt, negative_prompt, previous_name)
    except ValueError as exc:
        return web.json_response({"status": "error", "message": str(exc)}, status=400)

    return web.json_response(
        {
            "status": "ok",
            "name": name,
            "custom": custom_styles,
            "names": style_widget_list(),
        }
    )


@prompt_server.routes.post("/sdvn/styles/delete")
async def sdvn_delete_style(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid JSON payload."}, status=400)

    name = str(payload.get("name", "")).strip()

    try:
        custom_styles = delete_custom_style(name)
    except ValueError as exc:
        status = 404 if "không tồn tại" in str(exc) else 400
        return web.json_response({"status": "error", "message": str(exc)}, status=status)

    return web.json_response(
        {
            "status": "ok",
            "custom": custom_styles,
            "names": style_widget_list(),
        }
    )


@prompt_server.routes.post("/sdvn/gemini_image_presets/save")
async def sdvn_save_gemini_image_preset(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid JSON payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    previous_name = str(payload.get("previous_name", "")).strip()
    content = payload.get("content", "")

    if not name:
        return web.json_response({"status": "error", "message": "Tên preset không được để trống."}, status=400)
    if name in DEFAULT_IMAGE_PRESETS:
        return web.json_response({"status": "error", "message": "Tên preset trùng preset mặc định."}, status=400)

    try:
        normalized_content = normalize_custom_preset_text(content)
    except ValueError as exc:
        return web.json_response({"status": "error", "message": str(exc)}, status=400)

    custom_presets = load_custom_image_presets()
    if previous_name and previous_name not in DEFAULT_IMAGE_PRESETS and previous_name != name:
        custom_presets.pop(previous_name, None)
    custom_presets[name] = normalized_content
    save_custom_image_presets(custom_presets)

    return web.json_response(
        {
            "status": "ok",
            "name": name,
            "custom": custom_presets,
            "names": list(DEFAULT_IMAGE_PRESETS.keys()) + list(custom_presets.keys()),
        }
    )


@prompt_server.routes.post("/sdvn/gemini_image_presets/delete")
async def sdvn_delete_gemini_image_preset(request):
    try:
        payload = await request.json()
    except Exception:
        return web.json_response({"status": "error", "message": "Invalid JSON payload."}, status=400)

    name = str(payload.get("name", "")).strip()
    if not name:
        return web.json_response({"status": "error", "message": "Thiếu tên preset."}, status=400)
    if name in DEFAULT_IMAGE_PRESETS:
        return web.json_response({"status": "error", "message": "Không thể xóa preset mặc định."}, status=400)

    custom_presets = load_custom_image_presets()
    if name not in custom_presets:
        return web.json_response({"status": "error", "message": "Preset không tồn tại."}, status=404)

    custom_presets.pop(name, None)
    save_custom_image_presets(custom_presets)
    return web.json_response(
        {
            "status": "ok",
            "custom": custom_presets,
            "names": list(DEFAULT_IMAGE_PRESETS.keys()) + list(custom_presets.keys()),
        }
    )


def create_gemini_video_parts(video_input):
    video_inputs = video_input if isinstance(video_input, list) else [video_input]
    video_parts = []
    for video_item in video_inputs:
        if video_item is None:
            continue
        video_base64 = video_to_base64_string(video_item)
        video_parts.append(
            types.Part(
                inlineData=types.Blob(
                    data=base64.b64decode(video_base64),
                    mimeType="video/mp4",
                )
            )
        )
    return video_parts


def create_gemini_audio_parts(audio_input):
    audio_parts = []
    audio_inputs = audio_input if isinstance(audio_input, list) else [audio_input]
    for audio_item in audio_inputs:
        if audio_item is None:
            continue
        for batch_index in range(audio_item["waveform"].shape[0]):
            audio_at_index = {
                "waveform": audio_item["waveform"][batch_index].unsqueeze(0),
                "sample_rate": audio_item["sample_rate"],
            }
            audio_base64 = audio_to_base64_string(
                audio_at_index,
                container_format="mp3",
                codec_name="libmp3lame",
            )
            audio_parts.append(
                types.Part(
                    inlineData=types.Blob(
                        data=base64.b64decode(audio_base64),
                        mimeType="audio/mp3",
                    )
                )
            )
    return audio_parts


def create_gemini_file_part(file_path):
    if not file_path:
        return None

    normalized_path = os.path.expanduser(file_path.strip())
    if not os.path.isabs(normalized_path):
        input_candidate = os.path.join(folder_paths.get_input_directory(), normalized_path)
        normalized_path = input_candidate if os.path.exists(input_candidate) else normalized_path

    if not os.path.isfile(normalized_path):
        raise FileNotFoundError(f"Không tìm thấy file: {file_path}")
    if os.path.getsize(normalized_path) > GEMINI_MAX_INPUT_FILE_SIZE:
        raise ValueError(f"File vượt quá giới hạn {GEMINI_MAX_INPUT_FILE_SIZE // (1024 * 1024)}MB: {file_path}")

    mime_type = mimetypes.guess_type(normalized_path)[0] or "application/octet-stream"
    with open(normalized_path, "rb") as f:
        file_content = f.read()
    return types.Part(
        inlineData=types.Blob(
            data=file_content,
            mimeType=mime_type,
        )
    )


def collect_pil_images(image, image_limit=0):
    if image is None:
        return []

    pil_images = []

    def _append_from_tensor(img_tensor):
        if img_tensor is None:
            return
        if not isinstance(img_tensor, torch.Tensor):
            raise ValueError("Đầu vào image không đúng định dạng tensor.")
        if img_tensor.ndim == 4:
            for idx in range(img_tensor.shape[0]):
                pil_images.append(tensor2pil(img_tensor[idx]))
        elif img_tensor.ndim == 3:
            pil_images.append(tensor2pil(img_tensor))
        else:
            raise ValueError("Tensor image phải có shape [H, W, C] hoặc [N, H, W, C].")

    if isinstance(image, list):
        for item in image:
            _append_from_tensor(item)
    else:
        _append_from_tensor(image)

    if image_limit > 0:
        pil_images = pil_images[:image_limit]
    return pil_images

class API_chatbot:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "chatbot": (list(model_list), {"tooltip": "Chọn mô hình chatbot."}),
                "preset": (chatbot_preset_list(), {"tooltip": "Preset hội thoại mẫu."}),
                "APIkey": ("STRING", {"default": "", "multiline": False, "tooltip": """
Get API Gemini: https://aistudio.google.com/app/apikey
Get API OpenAI: https://platform.openai.com/settings/organization/api-keys
Get API HugggingFace: https://huggingface.co/settings/tokens
                                      """}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "main_prompt": ("STRING", {"default": "", "multiline": True, "tooltip": "Chatbot prompt"}),
                "sub_prompt": ("STRING", {"default": "", "multiline": True, "tooltip": "Chatbot prompt"}),
                "translate": (lang_list(), {"tooltip": "Ngôn ngữ của phản hồi."}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "Ảnh ngữ cảnh cho Gemini hoặc OpenAI."}),
                "audio": ("AUDIO", {"tooltip": "Audio ngữ cảnh cho Gemini."}),
                "video": ("VIDEO", {"tooltip": "Video ngữ cảnh cho Gemini."}),
                "file": ("STRING", {"default": "", "multiline": False, "tooltip": "Đường dẫn file cần tải lên cho Gemini. Hỗ trợ path tuyệt đối hoặc path tương đối từ thư mục input."}),
            }
        }

    CATEGORY = "📂 SDVN/💬 API"

    RETURN_TYPES = ("STRING", "STRING",)
    RETURN_NAMES = ("answer", "prompt")
    FUNCTION = "api_chatbot"
    INPUT_IS_LIST = True
    DESCRIPTION = "Gọi API chatbot để trả lời bằng văn bản."
    OUTPUT_TOOLTIPS = ("Phản hồi từ chatbot.", "Prompt cuối cùng trước khi gửi API.")

    def api_chatbot(self, chatbot, preset, APIkey, seed, main_prompt, sub_prompt, translate, image=None, audio=None, video=None, file=""):
        chatbot, preset, APIkey, seed, main_prompt, sub_prompt, translate = [
            chatbot[0], preset[0], APIkey[0], seed[0], main_prompt[0], sub_prompt[0], translate[0]
        ]
        file = file[0] if file else ""

        if APIkey == "":
            api_list = api_check()
            if api_check() != None:
                if "Gemini" in chatbot:
                    APIkey =  api_list["Gemini"]
                if "HuggingFace" in chatbot:
                    APIkey =  api_list["HuggingFace"]
                if "OpenAI" in chatbot:
                    APIkey =  api_list["OpenAI"]
                if "Deepseek" in chatbot:
                    APIkey =  api_list["Deepseek"]

        main_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(main_prompt, 1, seed)[0][0]
        sub_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(sub_prompt, 1, seed)[0][0]
        main_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(main_prompt,translate)[0]
        sub_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(sub_prompt,translate)[0]
        prompt = f"{main_prompt}.{sub_prompt}"
        model_name = model_list[chatbot]
        preset_messages = get_all_chatbot_presets().get(preset, DEFAULT_PRESET_PROMPTS["None"])
        prompt_output = "\n\n".join([msg["content"] for msg in preset_messages] + [prompt]) if preset_messages else prompt
        if 'Gemini' in chatbot:
            prompt += preset_messages[0]["content"] if preset_messages else ""
            prompt_output = prompt
            client = genai.Client(api_key=APIkey)
            contents = [types.Part.from_text(text=prompt)]
            for pil_image in collect_pil_images(image, image_limit=14):
                image_buffer = BytesIO()
                pil_image.save(image_buffer, format="PNG")
                contents.append(types.Part.from_bytes(data=image_buffer.getvalue(), mime_type="image/png"))
            if audio is not None:
                contents.extend(create_gemini_audio_parts(audio))
            if video is not None:
                contents.extend(create_gemini_video_parts(video))
            file_part = create_gemini_file_part(file)
            if file_part is not None:
                contents.append(file_part)
            response = client.models.generate_content(
                model=model_name,
                contents=types.Content(role="user", parts=contents),
            )
            answer = response.text
        if "HuggingFace" in chatbot:
            answer = ""
            client = OpenAI(
                base_url="https://api-inference.huggingface.co/v1/", api_key=APIkey)
            messages = [
                {"role": "user", "content": prompt}
            ]
            messages = preset_messages + messages
            stream = client.chat.completions.create(
                model=model_name,
                messages=messages,
                temperature=0.5,
                max_tokens=2048,
                top_p=0.7,
                stream=True
            )
            for chunk in stream:
                answer += chunk.choices[0].delta.content
        if "OpenAI" in chatbot:
            answer = ""
            client = OpenAI(api_key=APIkey)
            if image is not None:
                prompt_parts = [{"type": "input_text", "text": prompt}]
                for pil_image in collect_pil_images(image, image_limit=20):
                    image_buffer = BytesIO()
                    pil_image.save(image_buffer, format="PNG")
                    encoded_image = base64.b64encode(image_buffer.getvalue()).decode("utf-8")
                    prompt_parts.append({"type": "input_image", "image_url": f"data:image/png;base64,{encoded_image}"})
                prompt = prompt_parts
            messages = [
                {"role": "user", "content": prompt}
            ]
            messages = preset_messages + messages
            response = client.responses.create(
                model=model_name,
                input=messages
            )
            answer = response.output_text
        if "Deepseek" in chatbot:
            client = OpenAI(api_key=APIkey, base_url="https://api.deepseek.com")
            response = client.chat.completions.create(
                model = model_name,
                messages=[
                    {"role": "system", "content": preset_messages[0]["content"] if preset_messages else "You are a helpful assistant"},
                    {"role": "user", "content": prompt},
                ],
                stream=False
                )
            answer = response.choices[0].message.content
        return (answer.strip(), prompt_output)


class API_DALLE:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "OpenAI_API": ("STRING", {"default": "", "multiline": False, "tooltip": "Get API: https://platform.openai.com/settings/organization/api-keys"}),
                "size": (['1024x1024', '1024x1792', '1792x1024'],{"default": '1024x1024', "tooltip": "Kích thước ảnh."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Get API: https://platform.openai.com/settings/organization/api-keys", "tooltip": "Nội dung mô tả ảnh"}),
                "quality": (["standard","hd"], {"default": "standard", "tooltip": "Chất lượng ảnh"}),
                "translate": (lang_list(), {"tooltip": "Dịch prompt sang ngôn ngữ"}),
            }
        }

    CATEGORY = "📂 SDVN/💬 API"

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "api_dalle"
    DESCRIPTION = "Tạo ảnh qua API DALL-E 3."
    OUTPUT_TOOLTIPS = ("Ảnh kết quả.",)

    def api_dalle(self, OpenAI_API, size, seed, prompt, quality, translate):
        if OpenAI_API == "":
            api_list = api_check()
            OpenAI_API =  api_list["OpenAI"]
        prompt =ALL_NODE["SDVN Random Prompt"]().get_prompt(prompt, 1, seed)[0][0]
        prompt = ALL_NODE["SDVN Translate"]().ggtranslate(prompt,translate)[0]

        client = OpenAI(
            api_key=OpenAI_API
        )
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            size=size,
            quality=quality,
        )
        image_url = response.data[0].url
        image = ALL_NODE["SDVN Load Image Url"]().load_image_url(image_url)["result"][0]
        return (image,)

class API_GPT_image:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "OpenAI_API": ("STRING", {"default": "", "multiline": False, "tooltip": "Get API: https://platform.openai.com/settings/organization/api-keys"}),
                "model": (["gpt-image-1.5", "gpt-image-1", "gpt-image-1-mini"], {"default": "gpt-image-1", "tooltip": "Chọn model GPT Image"}),
                "size": (["auto",'1024x1024', '1536x1024', '1024x1536'],{"default": "auto", "tooltip": "Kích thước"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Get API: https://platform.openai.com/settings/organization/api-keys", "tooltip": "Mô tả ảnh"}),
                "quality": (["auto","low","medium","high"], {"default": "medium", "tooltip": "Chất lượng"}),
                "background": (["opaque","transparent"], {"default": "opaque", "tooltip": "Nền ảnh"}),
                "n": ("INT", {"default": 1, "min": 1, "max": 4, "tooltip": "Số ảnh"}),
                "translate": (lang_list(), {"tooltip": "Dịch prompt"}),
            },
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",)
            }
        }

    CATEGORY = "📂 SDVN/💬 API"

    RETURN_TYPES = ("IMAGE",)
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "API_GPT_image"

    def API_GPT_image(self, OpenAI_API, model, size, seed, prompt, quality, background, n, translate, image = None, mask = None):
        OpenAI_API = OpenAI_API[0]
        model = model[0]
        size = size[0]
        seed = seed[0]
        prompt = prompt[0]
        quality = quality[0]
        background = background[0]
        n = n[0]

        translate = translate[0]
        if OpenAI_API == "":
            api_list = api_check()
            OpenAI_API =  api_list["OpenAI"]

        prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(prompt, 1, seed)[0][0]
        prompt = ALL_NODE["SDVN Translate"]().ggtranslate(prompt,translate)[0]
            
        client = OpenAI(
            api_key=OpenAI_API
        )
        if image == None:
            result = client.images.generate(
                model=model,
                prompt=prompt,
                size = size,
                quality = quality,
                background = background,
                moderation = "low",
                n = n
            )
        elif mask == None:
            result = client.images.edit(
                model=model,
                prompt=prompt,
                size = size,
                quality = quality,
                image = [pil_to_bytesio(img) for img in image],
                n = n,
            )
        else:
            result = client.images.edit(
                model=model,
                prompt=prompt,
                size = size,
                quality = quality,
                image = pil_to_bytesio(image[0]),
                n = n,
                mask = mask_bytesio(mask[0]),
            )
        images = []
        for i in range(n):
            image_base64 = result.data[i].b64_json
            image_bytes = base64.b64decode(image_base64)
            image_pil = Image.open(BytesIO(image_bytes))
            image_ten = pil2tensor(image_pil)
            images.append(image_ten)
        return (images,)

class API_Imagen:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Gemini_API": ("STRING", {"default": "", "multiline": False, "tooltip": "Get API: https://aistudio.google.com/apikey"}),
                "aspect_ratio": (['1:1', '3:4', '4:3', '9:16', '16:9'],{"default": "1:1", "tooltip": "Tỷ lệ khung"}),
                "person_gen": ("BOOLEAN", {"default": True, "tooltip": "Cho phép tạo ảnh người"},),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Prompt", "tooltip": "Mô tả ảnh"}),
                "translate": (lang_list(), {"tooltip": "Ngôn ngữ dịch"}),
            }
        }

    CATEGORY = "📂 SDVN/💬 API"

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "api_imagen"

    def api_imagen(self, Gemini_API, aspect_ratio, person_gen, seed, prompt, translate):
        if Gemini_API == "":
            api_list = api_check()
            Gemini_API =  api_list["Gemini"]

        prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(prompt, 1, seed)[0][0]
        prompt = ALL_NODE["SDVN Translate"]().ggtranslate(prompt,translate)[0]

        client = genai.Client(api_key=Gemini_API)
        response = client.models.generate_images(
            model='imagen-3.0-generate-002',
            prompt=prompt,
            config=types.GenerateImagesConfig(
                number_of_images= 1,
                aspect_ratio = aspect_ratio,
                output_mime_type = 'image/jpeg',
                person_generation = 'ALLOW_ADULT' if person_gen else 'DONT_ALLOW',
            ),
        )
        for generated_image in response.generated_images:
            image = Image.open(BytesIO(generated_image.image.image_bytes))
        image = pil2tensor(image)
        return (image,)
        
def i2tensor(i) -> torch.Tensor:
    i = ImageOps.exif_transpose(i)
    image = i.convert("RGB")
    image = np.array(image).astype(np.float32) / 255.0
    image = torch.from_numpy(image)[None,]
    return image
    
class Gemini_Flash2_Image:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Gemini_API": ("STRING", {"default": "", "multiline": False, "tooltip": "Get API: https://aistudio.google.com/apikey"}),
                "max_size_input": ("INT", {"default":0,"min":0,"max":2048,"step":64, "tooltip": "Giới hạn kích thước ảnh"}),
                "preset": (image_preset_list(), {"tooltip": "Preset prompt cho tạo ảnh."}),
                "prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Main prompt", "tooltip": "Nội dung yêu cầu chính"}),
                "sub_prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Sub prompt", "tooltip": "Prompt phụ, ghép giống node chatbot"}),
                "translate": (lang_list(),{"default":"english", "tooltip": "Ngôn ngữ dịch"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "show_preview": ("BOOLEAN", {"default": True, "tooltip": "Hiển thị preview ảnh output trên node"}),
            },
            "optional": {
                "image": ("IMAGE",)
            }
        }
    INPUT_IS_LIST = True
    CATEGORY = "📂 SDVN/💬 API"

    RETURN_TYPES = ("IMAGE", "STRING",)
    RETURN_NAMES = ("image", "prompt")
    FUNCTION = "api_imagen"

    def api_imagen(self, Gemini_API, max_size_input, preset, prompt, sub_prompt, translate, seed, show_preview, image = None):
        Gemini_API, max_size_input, preset, prompt, sub_prompt, translate, seed, show_preview = [Gemini_API[0], max_size_input[0], preset[0], prompt[0], sub_prompt[0], translate[0], seed[0], show_preview[0]]
        if Gemini_API == "":
            api_list = api_check()
            Gemini_API =  api_list["Gemini"]

        main_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(prompt, 1, seed)[0][0]
        sub_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(sub_prompt, 1, seed)[0][0]
        main_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(main_prompt,translate)[0]
        sub_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(sub_prompt,translate)[0]
        prompt = f"{main_prompt}.{sub_prompt}"
        prompt = merge_image_preset_prompt(prompt, preset)
        client = genai.Client(api_key=Gemini_API)
        if image != None:
            if max_size_input != 0:
                list_img = [ALL_NODE["SDVN Upscale Image"]().upscale("Maxsize", max_size_input, max_size_input, 1, "None", i)[0] for i in image]
            list_img = [tensor2pil(i) for i in image]
        response = client.models.generate_content(
            model="gemini-2.5-flash-image",
            contents=[prompt, *list_img] if image != None else prompt,
            config=types.GenerateContentConfig(
            response_modalities=['Text', 'Image']
            )
        )
        for part in response.candidates[0].content.parts:
            if part.text is not None:
                print(part.text)
            elif part.inline_data is not None:
                image = Image.open(BytesIO(part.inline_data.data))              
        image = pil2tensor(image)
        return with_node_preview((image, prompt), image, show_preview)

class Gemini_3_Pro_Image:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Gemini_API": ("STRING", {"default": "", "multiline": False, "tooltip": "Get API: https://aistudio.google.com/apikey"}),
                "preset": (image_preset_list(), {"tooltip": "Preset prompt cho tạo ảnh."}),
                "prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Main prompt", "tooltip": "Nội dung yêu cầu chính"}),
                "sub_prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Sub prompt", "tooltip": "Prompt phụ, ghép giống node chatbot"}),
                "aspect_ratio": (["Auto","1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"], {"default": "Auto", "tooltip": "Tỷ lệ khung hình"}),
                "resolution": (["1K", "2K", "4K"], {"default": "1K", "tooltip": "Độ phân giải"}),
                "translate": (lang_list(), {"default": "None", "tooltip": "Ngôn ngữ dịch"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "show_preview": ("BOOLEAN", {"default": True, "tooltip": "Hiển thị preview ảnh output trên node"}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "Ảnh tham khảo (Tối đa 14 ảnh)"})
            }
        }

    CATEGORY = "📂 SDVN/💬 API"
    RETURN_TYPES = ("IMAGE","STRING","STRING",)
    RETURN_NAMES = ("image", "text_output", "prompt")
    FUNCTION = "api_imagen"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (False, False, False)

    def api_imagen(self, Gemini_API, preset, prompt, sub_prompt, aspect_ratio, resolution, translate, seed, show_preview, image=None):
        Gemini_API, preset, prompt, sub_prompt, aspect_ratio, resolution, translate, seed, show_preview = [
            Gemini_API[0], preset[0], prompt[0], sub_prompt[0], aspect_ratio[0], resolution[0], translate[0], seed[0], show_preview[0]
        ]
        
        if Gemini_API == "":
            api_list = api_check()
            Gemini_API = api_list["Gemini"]

        main_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(prompt, 1, seed)[0][0]
        sub_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(sub_prompt, 1, seed)[0][0]
        main_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(main_prompt, translate)[0]
        sub_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(sub_prompt, translate)[0]
        prompt = f"{main_prompt}.{sub_prompt}"
        prompt = merge_image_preset_prompt(prompt, preset)
        
        client = genai.Client(api_key=Gemini_API)
        
        contents = [prompt]
        if image is not None:       
            pil_images = []
            for img_batch in image:
                for i in range(img_batch.shape[0]):
                    pil_images.append(tensor2pil(img_batch[i]))
            
            pil_images = pil_images[:14]
            contents.extend(pil_images)

        response = client.models.generate_content(
            model="gemini-3-pro-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE'],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio if aspect_ratio != "Auto" else None,
                    image_size=resolution
                ),
            )
        )
        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, "gemini-3-pro-image-preview.png")
        if os.path.exists(temp_path):
            name, ext = os.path.splitext(temp_path)
            counter = 1
            while os.path.exists(f"{name}_{counter}{ext}"):
                counter += 1
            temp_path = f"{name}_{counter}{ext}"

        for part in response.parts:
            if part.text is not None:
                text_output = part.text
            else:
                text_output = ""
            if image:= part.as_image():
                image.save(temp_path)
                img = Image.open(temp_path)
                img = i2tensor(img)
            else:
                img = torch.zeros((1, 64, 64, 3))
        return with_node_preview((img, text_output, prompt), img, show_preview)


class Gemini_3_1_Flash_Image:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Gemini_API": ("STRING", {"default": "", "multiline": False, "tooltip": "Get API: https://aistudio.google.com/apikey"}),
                "preset": (image_preset_list(), {"tooltip": "Preset prompt cho tạo ảnh."}),
                "prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Main prompt", "tooltip": "Nội dung yêu cầu chính"}),
                "sub_prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Sub prompt", "tooltip": "Prompt phụ, ghép giống node chatbot"}),
                "aspect_ratio": (["Auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"], {"default": "Auto", "tooltip": "Tỷ lệ khung hình"}),
                "resolution": (["0,5K", "1K", "2K", "4K"], {"default": "1K", "tooltip": "Độ phân giải"}),
                "translate": (lang_list(), {"default": "None", "tooltip": "Ngôn ngữ dịch"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "show_preview": ("BOOLEAN", {"default": True, "tooltip": "Hiển thị preview ảnh output trên node"}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "Ảnh tham khảo (Tối đa 14 ảnh)"})
            }
        }

    CATEGORY = "📂 SDVN/💬 API"
    RETURN_TYPES = ("IMAGE", "STRING", "STRING",)
    RETURN_NAMES = ("image", "text_output", "prompt")
    FUNCTION = "api_imagen"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (False, False, False)

    def api_imagen(self, Gemini_API, preset, prompt, sub_prompt, aspect_ratio, resolution, translate, seed, show_preview, image=None):
        Gemini_API, preset, prompt, sub_prompt, aspect_ratio, resolution, translate, seed, show_preview = [
            Gemini_API[0], preset[0], prompt[0], sub_prompt[0], aspect_ratio[0], resolution[0], translate[0], seed[0], show_preview[0]
        ]

        if Gemini_API == "":
            api_list = api_check()
            Gemini_API = api_list["Gemini"]

        main_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(prompt, 1, seed)[0][0]
        sub_prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(sub_prompt, 1, seed)[0][0]
        main_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(main_prompt, translate)[0]
        sub_prompt = ALL_NODE["SDVN Translate"]().ggtranslate(sub_prompt, translate)[0]
        prompt = f"{main_prompt}.{sub_prompt}"
        prompt = merge_image_preset_prompt(prompt, preset)

        client = genai.Client(api_key=Gemini_API)

        contents = [prompt]
        if image is not None:
            pil_images = []
            for img_batch in image:
                for i in range(img_batch.shape[0]):
                    pil_images.append(tensor2pil(img_batch[i]))
            pil_images = pil_images[:14]
            contents.extend(pil_images)

        api_resolution = resolution.replace(",", ".")
        response = client.models.generate_content(
            model="gemini-3.1-flash-image-preview",
            contents=contents,
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE'],
                image_config=types.ImageConfig(
                    aspect_ratio=aspect_ratio if aspect_ratio != "Auto" else None,
                    image_size=api_resolution
                ),
            )
        )
        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)
        temp_path = os.path.join(temp_dir, "gemini-3.1-flash-image-preview.png")
        if os.path.exists(temp_path):
            name, ext = os.path.splitext(temp_path)
            counter = 1
            while os.path.exists(f"{name}_{counter}{ext}"):
                counter += 1
            temp_path = f"{name}_{counter}{ext}"

        for part in response.parts:
            if part.text is not None:
                text_output = part.text
            else:
                text_output = ""
            if image := part.as_image():
                image.save(temp_path)
                img = Image.open(temp_path)
                img = i2tensor(img)
            else:
                img = torch.zeros((1, 64, 64, 3))
        return with_node_preview((img, text_output, prompt), img, show_preview)


class Gemini_Nano_Banana:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Gemini_API": ("STRING", {"default": "", "multiline": False, "tooltip": "Get API: https://aistudio.google.com/apikey"}),
                "model": (
                    ["Nano Banana", "Nano Banana Pro", "Nano Banana 2"],
                    {"default": "Nano Banana 2", "tooltip": "Chọn model Gemini Image"},
                ),
                "preset": (image_preset_list(), {"tooltip": "Preset prompt cho tạo ảnh."}),
                "prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Main prompt", "tooltip": "Nội dung yêu cầu chính"}),
                "sub_prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "Sub prompt", "tooltip": "Prompt phụ, ghép giống node chatbot"}),
                "aspect_ratio": (
                    ["Auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "1:4", "4:1", "1:8", "8:1"],
                    {"default": "Auto", "tooltip": "Tỷ lệ khung hình"},
                ),
                "resolution": (["0,5K", "1K", "2K", "4K"], {"default": "1K", "tooltip": "Độ phân giải"}),
                "translate": (lang_list(), {"default": "None", "tooltip": "Ngôn ngữ dịch"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "show_preview": ("BOOLEAN", {"default": True, "tooltip": "Hiển thị preview ảnh output trên node"}),
            },
            "optional": {
                "image": ("IMAGE", {"tooltip": "Ảnh tham khảo (Tối đa 14 ảnh)"})
            }
        }

    CATEGORY = "📂 SDVN/💬 API"
    RETURN_TYPES = ("IMAGE", "STRING", "STRING",)
    RETURN_NAMES = ("image", "text_output", "prompt")
    FUNCTION = "api_imagen"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (False, False, False)

    def api_imagen(self, Gemini_API, model, preset, prompt, sub_prompt, aspect_ratio, resolution, translate, seed, show_preview, image=None):
        show_preview_value = show_preview[0] if isinstance(show_preview, list) and len(show_preview) > 0 else show_preview
        model_name = model[0] if isinstance(model, list) and len(model) > 0 else model
        if model_name == "Nano Banana":
            image_out, final_prompt = Gemini_Flash2_Image().api_imagen(Gemini_API,[0],preset,prompt,sub_prompt,translate,seed,[False],image = image)
            return with_node_preview((image_out, "", final_prompt), image_out, show_preview_value)
        elif model_name == "Nano Banana Pro":
            image_out, text_output, final_prompt = Gemini_3_Pro_Image().api_imagen(Gemini_API,preset,prompt,sub_prompt,aspect_ratio,resolution,translate,seed,[False],image = image)
            return with_node_preview((image_out, text_output, final_prompt), image_out, show_preview_value)
        elif model_name == "Nano Banana 2":
            image_out, text_output, final_prompt = Gemini_3_1_Flash_Image().api_imagen(Gemini_API,preset,prompt,sub_prompt,aspect_ratio,resolution,translate,seed,[False],image = image)
            return with_node_preview((image_out, text_output, final_prompt), image_out, show_preview_value)
        zero_image = torch.zeros((1, 64, 64, 3))
        return with_node_preview((zero_image, f"Unsupported model: {model_name}", ""), zero_image, show_preview_value)

NODE_CLASS_MAPPINGS = {
    "SDVN Run Python Code": run_python_code,
    "SDVN API chatbot": API_chatbot,
    "SDVN DALL-E Generate Image": API_DALLE,
    "SDVN GPT Image": API_GPT_image, 
    "SDVN Google Imagen": API_Imagen,
    "SDVN Gemini Flash 2 Image": Gemini_Flash2_Image,
    "SDVN Gemini 3 Pro Image": Gemini_3_Pro_Image,
    "SDVN Gemini 3.1 Flash Image": Gemini_3_1_Flash_Image,
    "SDVN Nano Banana": Gemini_Nano_Banana,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Run Python Code": "👨🏻‍💻 Run Python Code",
    "SDVN API chatbot": "💬 Chatbot",
    "SDVN DALL-E Generate Image": "🎨 DALL-E 3",
    "SDVN Google Imagen": "🎨 Google Imagen",
    "SDVN Gemini Flash 2 Image": "🎨 Nano Banana (Gemini 2)",
    "SDVN GPT Image": "🎨 GPT Image",
    "SDVN Gemini 3 Pro Image": "🎨 Nano Banana Pro (Gemini 3 Pro)",
    "SDVN Gemini 3.1 Flash Image": "🎨 Nano Banana 2 (Gemini 3.1)",
    "SDVN Nano Banana": "🎨 Nano Banana",
}
