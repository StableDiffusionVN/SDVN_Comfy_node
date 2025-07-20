import requests, math, json, os, re, sys, torch, hashlib, subprocess, numpy as np, csv, random as rd
import folder_paths, comfy.utils
from PIL import Image, ImageOps
from googletrans import LANGUAGES
from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
from comfy.cldm.control_types import UNION_CONTROLNET_TYPES
sys.path.insert(0, os.path.join(os.path.dirname(os.path.realpath(__file__)), "comfy"))

class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __eq__(self, _) -> bool:
        return True

    def __ne__(self, __value: object) -> bool:
        return False


any = AnyType("*")

def style_list():
    file_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"styles.csv")
    with open(file_path, mode="r", encoding="utf-8") as file:
        reader = csv.reader(file)
        data_list = [row for row in reader]
    my_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"my_styles.csv")
    if os.path.exists(my_path):
            with open(my_path, mode="r", encoding="utf-8") as file:
                reader = csv.reader(file)
                my_data_list = [row for row in reader]
            data_list = my_data_list + data_list
    card_list = []
    for i in data_list:
        card_list += [i[0]]
    return (card_list,data_list)
    
def lang_list():
    lang_list = ["None"]
    for i in LANGUAGES.items():
        lang_list += [i[1]]
    return lang_list

def none2list(folderlist):
    list = ["None"]
    list += folderlist
    return list


def pil2tensor(i) -> torch.Tensor:
    i = ImageOps.exif_transpose(i)
    if i.mode not in ["RGB", "RGBA"]:
        i = i.convert("RGBA")
    image = np.array(i).astype(np.float32) / 255.0
    image = torch.from_numpy(image)[None,]
    return image  # shape: [1, H, W, 3] hoặc [1, H, W, 4]

def insta_download(url,index):
    if "index=" in url:
        index = int(url.split('index=')[1])
    id = re.findall(r'p/(.*)', url)[0].split('?')[0].split('/')[0].strip()
    path_folder = os.path.join(folder_paths.get_input_directory(), 'instadownload')
    command = ['instaloader', '--slide', str(index), '--no-captions', '--no-metadata-json', '--dirname-pattern', path_folder, '--filename-pattern', id, '--', f'-{id}']
    subprocess.run(command, check=True,text=True, capture_output=True)
    path_img = os.path.join(path_folder, f"{id}_{index}.jpg")
    return path_img

def run_gallery_dl(url):
    if '--' in url:
        try:
            index = int(url.split('--')[1])
        except:
            index = 0
        url = url.split('--')[0]
    else:
        index = 0
    if 'http' not in url:
        type_name = url.split('.')[-1].lower()
        if type_name in ["jpeg", "webp", "png", "jpg", "bmp"]:
            path = url
        else:
            path = LoadImageFolder().list_img_by_path(url.strip())[index]
        return path
    if 'instagram.com' in url:
        index = index + 1
        return insta_download(url,index)
    command = ['gallery-dl', '-G', url]
    try:
        result = subprocess.run(command, check=True,text=True, capture_output=True)
        result = result.stdout.strip()
        if 'http' not in result:
            result = 'https://raw.githubusercontent.com/StableDiffusionVN/SDVN_Comfy_node/refs/heads/main/preview/eror.jpg'
        if '\n' in result:
            try:
                result = result.split('\n')[index]
            except:
                result = result.split('\n')[-1]
        result = result.replace('|','')
    except:
        print('Cannot find image link')
        result = 'https://raw.githubusercontent.com/StableDiffusionVN/SDVN_Comfy_node/refs/heads/main/preview/eror.jpg'
    return result

def civit_downlink(link):
    command = ['wget', link, '-O', 'model.html']
    subprocess.run(command, check=True, text=True, capture_output=True)
    try:
        # Mở tệp và đọc nội dung
        with open('model.html', 'r', encoding='utf-8') as file:
            html_content = file.read()
        pattern = r'"modelVersionId":(\d+),'
        model_id = re.findall(pattern, html_content)
        if model_id:
            api_link = f'https://civitai.com/api/download/models/{model_id[0]}'
            print(f'Download model id_link: {api_link}')
            return api_link
        else:
            return "Không tìm thấy đoạn nội dung phù hợp."
    except requests.RequestException as e:
        return f"Lỗi khi tải trang: {e}"


def check_link(link):
    if 'huggingface.co' in link:
        if 'blob' in link:
            link = link.replace('blob', 'resolve')
            return link
        else:
            return link
    if 'civitai.com' in link:
        if 'civitai.com/models' in link:
            return civit_downlink(link)
        else:
            return link


def token(link):
    if "civitai" in link:
        token = f'?token=8c7337ac0c39fe4133ae19a3d65b806f'
    else:
        token = ""
    return token

def download_model(url, name, type):
    url = url.replace("&", "\&").split("?")[0]
    url = check_link(url)
    folder_path = os.path.join(folder_paths.models_dir, type)
    path_model = os.path.join(folder_path, name)
    if not os.path.isfile(path_model):
        command = ['aria2c', '-c', '-x', '16', '-s', '16', '-k', '1M', f'{url}{token(url)}', '-d', folder_path, '-o', name]
        subprocess.run(command, check=True, text=True, capture_output=True)
    
class LoadImage:
    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        exclude_folders = ["clipspace", "folder_to_exclude2"]
        file_list = []

        for root, dirs, files in os.walk(input_dir):
            # Exclude specific folders
            dirs[:] = [d for d in dirs if d not in exclude_folders]

            for file in files:
                file_path = os.path.relpath(
                    os.path.join(root, file), start=input_dir)
                # so the filename is processed correctly in widgets.js
                file_path = file_path.replace("\\", "/")
                img_type = file_path.split('.')[-1].lower()
                if img_type in ["jpeg", "webp", "png", "jpg", "bmp"]:
                    file_list.append(file_path)

        return {
            "required": {
                "Load_url": ("BOOLEAN", {"default": True},),
                "Url": ("STRING", {"default": "", "multiline": False},),
                "image": (sorted(none2list(file_list)), {"image_upload": True, "default": "None", "tooltip": "The image to be loaded."}),
            }
        }

    CATEGORY = "📂 SDVN"

    RETURN_TYPES = ("IMAGE", "MASK", "STRING",)
    RETURN_NAMES = ("image","mask", "img_path",)
    FUNCTION = "load_image"

    def load_image(self, Load_url, Url, image):
        image_path = folder_paths.get_annotated_filepath(image)
        image_path = image_path if image != "None" and os.path.exists(image_path) else None
        if Url != '' and Load_url and 'clipspace' not in image:
            Url = run_gallery_dl(Url)
            if 'http' in Url:
                i = Image.open(requests.get(Url, stream=True).raw)
            else:
                i = Image.open(Url)
        else:
            if image_path == None:
                return (None, None, None)
            i = Image.open(image_path)
        ii = ImageOps.exif_transpose(i)
        if 'A' in ii.getbands():
            mask = np.array(ii.getchannel('A')).astype(np.float32) / 255.0
            mask = 1. - torch.from_numpy(mask)
        else:
            mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
        image = self.i2tensor(i)
        results = ALL_NODE["PreviewImage"]().save_images(image)
        results["result"] = (image, mask.unsqueeze(0), image_path)
        if image_path != None:
            if 'clipspace' in image_path:
                del results["ui"]
        return results
    
    def i2tensor(s, i) -> torch.Tensor:
        i = ImageOps.exif_transpose(i)
        image = i.convert("RGB")
        image = np.array(image).astype(np.float32) / 255.0

        image = torch.from_numpy(image)[None,]
        return image
    
    @classmethod
    def IS_CHANGED(self, Load_url, Url, image="None"):
        image_path = folder_paths.get_annotated_filepath(image)
        if image != "None" and os.path.exists(image_path):
            m = hashlib.sha256()
            with open(image_path, 'rb') as f:
                m.update(f.read())
            return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(self, Load_url, Url, image="None"):
        image_path = folder_paths.get_annotated_filepath(image)
        if image != "None" and os.path.exists(image_path):
            if not folder_paths.exists_annotated_filepath(image):
                return "Invalid image file: {}".format(image)
        return True

class LoadImageFolder:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "folder_path": ("STRING", {"default": "", "multiline": False},),
                "number": ("INT", {"default": 1, "min": -1 , "tooltip": "Chuyển sang -1 để load toàn bộ ảnh"}),
                "random": ("BOOLEAN", {"default": True},),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                #"auto_index": ("BOOLEAN", {"default": False, "label_on": "loop", "label_off": "off"},),
            }
        }

    CATEGORY = "📂 SDVN"

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("image", "img_path")
    OUTPUT_IS_LIST = (True, True)
    FUNCTION = "load_image"

    def list_img_by_path(s,file_path):
        list_img = []

        if os.path.isfile(file_path):
            file_path = os.path.dirname(file_path)

        for file in os.listdir(file_path):
            file_full_path = os.path.join(file_path, file)
            if os.path.isdir(file_full_path):
                list_img.extend(s.list_img_by_path(file_full_path))
            elif os.path.isfile(file_full_path):
                type_name = file.split('.')[-1].lower()
                if type_name in ["jpeg", "webp", "png", "jpg", "bmp"]:
                    list_img.append(file_full_path)
        return list_img

    def load_image(self, folder_path, number, random, seed):
        index = seed
        list_img = self.list_img_by_path(folder_path)
        index = index%len(list_img)
        len_img = number if number > 0 else len(list_img)
        image = []
        new_list = []
        image_path = list_img
        for x in range(len_img):
            if random:
                path = rd.choice(image_path)
                list_img.remove(path)
            else:
                new_index = (index+x)%len(image_path)
                path = list_img[new_index]
            new_list.append(path)
            img = Image.open(path)
            img = pil2tensor(img)
            image.append(img)
        ui = {"images":[]}
        for i in image:
            ui["images"].append(ALL_NODE["PreviewImage"]().save_images(i)["ui"]["images"][0])
        return {"ui":ui, "result":(image,new_list)}
    
class LoadImageUrl:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "Url": ("STRING", {"default": "", "multiline": False},)
        }
        }

    CATEGORY = "📂 SDVN"

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "load_image_url"

    def load_image_url(self, Url):  
        Url = run_gallery_dl(Url)
        if 'http' in Url:
            image = Image.open(requests.get(Url, stream=True).raw)
        else:
            image = Image.open(Url)
        image = pil2tensor(image)
        results = ALL_NODE["PreviewImage"]().save_images(image)
        results["result"] = (image,)
        return results

#Pintrest

class LoadPinterest:

    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "url": ("STRING", {"default": "", "multiline": False},),
            "range": ("STRING", {"default": "1-10", "multiline": False, "tooltip": "Chuyển sang -1 để tải toàn bộ"},),
            "number": ("INT", {"default": 1, "min": -1 , "tooltip": "Chuyển sang -1 để load toàn bộ ảnh"}),
            "random": ("BOOLEAN", {"default": False},),
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
        }
        }
    CATEGORY = "📂 SDVN"
    RETURN_TYPES = ("IMAGE",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "load_image_url"

    def pintrest_board_download(s, url, range):
        input_folder = folder_paths.get_input_directory()
        id_folder = url.split("https://www.pinterest.com/")[-1] if "/search/pins/" not in url else "search/"+(url.split("https://www.pinterest.com/search/pins/?q=")[-1].replace("%20", "_"))
        save_folder = os.path.join(input_folder, "pintrest", id_folder, range)
        if range != "":
            command = ['gallery-dl', '--range', range, url, "-D", save_folder]
        else:
            command = ['gallery-dl', url, "-D", save_folder]
        try:
            subprocess.run(command, check=True, text=True, capture_output=True)
        except subprocess.CalledProcessError as e:
            print("Có thể lượng ảnh ít hơn khoảng range, chuyển range về -1")
        return save_folder
    
    def load_image_url(s, url, range, number, random, seed):
        if "pinterest.com/pin/" in url:
            r = LoadImageUrl().load_image_url(url)
            result = {"ui": r["ui"], "result": ([r["result"][0]],)}
            return result
        if "/" in url:
            if "www.pinterest.com" not in url:
                url = "https://www.pinterest.com" + url
            if "https://" not in url:
                url = "https://" + url
        else:
            url = f'https://www.pinterest.com/search/pins/?q={url.replace(" ", "%20")}'
        if "/pin/" in url:
            image = LoadImageUrl().load_image_url(url)["result"][0]
            image = [image]        
        else:
            pin_folder = s.pintrest_board_download(url, range)
        result = LoadImageFolder().load_image(pin_folder, number, random, seed)
        return result

class LoadImageUltimate:
    @classmethod
    def INPUT_TYPES(s):
        input_dir = folder_paths.get_input_directory()
        exclude_folders = ["clipspace", "folder_to_exclude2"]
        file_list = []

        for root, dirs, files in os.walk(input_dir):
            # Exclude specific folders
            dirs[:] = [d for d in dirs if d not in exclude_folders]

            for file in files:
                file_path = os.path.relpath(
                    os.path.join(root, file), start=input_dir)
                # so the filename is processed correctly in widgets.js
                file_path = file_path.replace("\\", "/")
                img_type = file_path.split('.')[-1].lower()
                if img_type in ["jpeg", "webp", "png", "jpg", "bmp"]:
                    file_list.append(file_path)

        return {"required": {
            "mode": (["Input folder", "Custom folder", "Url", "Pintrest", "Insta"],),
            #Input_folder
            "image": (sorted(none2list(file_list)), {"image_upload": True, "default": "None", "tooltip": "The image to be loaded."}),
            #Custom_folder
            "folder_path": ("STRING", {"default": "", "multiline": False},),
            "number_img": ("INT", {"default": 1, "min": -1 , "tooltip": "Chuyển sang -1 để load toàn bộ ảnh"}),
            #Url
            "url": ("STRING", {"default": "", "multiline": False},),
            #Pintrest
            "pin_url": ("STRING", {"default": "", "multiline": False},),
            "range": ("STRING", {"default": "1-10", "multiline": False, "tooltip": "Chuyển sang -1 để tải toàn bộ"},),
            "number": ("INT", {"default": 1, "min": -1 , "tooltip": "Chuyển sang -1 để load toàn bộ ảnh"}),
            "random": ("BOOLEAN", {"default": False},),
            #Insta
            "insta_url": ("STRING", {"default": "", "multiline": False},),
            "index": ("INT", {"default": 0}),
            #seed
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
        }
        }
    
    CATEGORY = "📂 SDVN"
    RETURN_TYPES = ("IMAGE",)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = "load_image"

    def load_image(s, mode, image, folder_path, number_img, url, pin_url, range, number, random,  insta_url, index, seed):
        if mode == "Input folder":
            image = LoadImage().load_image(False, "", image)["result"][0]
            image = [image]
        if mode == "Custom folder":
            image = LoadImageFolder().load_image(folder_path, number_img, False, seed)["result"][0]
        if mode == "Url":
            image = LoadImageUrl().load_image_url(url)["result"][0]
            image = [image]
        if mode == "Pintrest":
            image = LoadPinterest().load_image_url(pin_url, range, number, random, seed)["result"][0]
        if mode == "Insta":
            insta_url += "--{}".format(index)
            image = LoadImageUrl().load_image_url(insta_url)["result"][0]
            image = [image]
        ui = {"images":[]}
        for i in image:
            ui["images"].append(ALL_NODE["PreviewImage"]().save_images(i)["ui"]["images"][0])
        return {"ui":ui, "result":(image,)}
    
    @classmethod
    def IS_CHANGED(self, mode, image, folder_path, number_img, url, pin_url, range, number, random,  insta_url, index, seed):
        image_path = folder_paths.get_annotated_filepath(image)
        if image != "None" and os.path.exists(image_path):
            m = hashlib.sha256()
            with open(image_path, 'rb') as f:
                m.update(f.read())
            return m.digest().hex()

    @classmethod
    def VALIDATE_INPUTS(self, mode, image, folder_path, number_img, url, pin_url, range, number, random,  insta_url, index, seed):
        image_path = folder_paths.get_annotated_filepath(image)
        if image != "None" and os.path.exists(image_path):
            if not folder_paths.exists_annotated_filepath(image):
                return "Invalid image file: {}".format(image)
        return True 

class CheckpointLoaderDownload:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)
    checkpointlist = list(set(folder_paths.get_filename_list("checkpoints") + list(modellist)))
    checkpointlist.sort()
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Download": ("BOOLEAN", {"default": True},),
                "Download_url": ("STRING", {"default": "", "multiline": False},),
                "Ckpt_url_name": ("STRING", {"default": "model.safetensors", "multiline": False},),
                "Ckpt_name": (none2list(s.checkpointlist), {"tooltip": "The name of the checkpoint (model) to load."})
            }
        }
    RETURN_TYPES = ("MODEL", "CLIP", "VAE", "STRING")
    RETURN_NAMES = ("model", "clip", "vae", "ckpt_path")
    OUTPUT_TOOLTIPS = ("The model used for denoising latents.",
                       "The CLIP model used for encoding text prompts.",
                       "The VAE model used for encoding and decoding images to and from latent space.")
    FUNCTION = "load_checkpoint"

    CATEGORY = "📂 SDVN"
    DESCRIPTION = "Loads a diffusion model checkpoint, diffusion models are used to denoise latents."

    def load_checkpoint(self, Download, Download_url, Ckpt_url_name, Ckpt_name):
        if not Download or Download_url == '':
            if Ckpt_name in self.modellist:
                Download = True
                Download_url = self.modellist[Ckpt_name]
                Ckpt_url_name = Ckpt_name        
        if Download and Download_url != "":
            download_model(Download_url, Ckpt_url_name, "checkpoints")
            Ckpt_name = Ckpt_url_name
        results = ALL_NODE["CheckpointLoaderSimple"]().load_checkpoint(Ckpt_name)
        path = folder_paths.get_full_path_or_raise("checkpoints", Ckpt_name)
        index = 0
        if not Download or Download_url == '':
            name = Ckpt_name.split("/")[-1].rsplit(".", 1)[0]
            for i in ["jpg","jpeg","png"]:
                if os.path.exists(os.path.join(os.path.dirname(path),f"{name}.{i}")):
                    i_cover = os.path.join(os.path.dirname(path),f"{name}.{i}")
                    index += 1
        if index > 0:
            i = Image.open(i_cover)
            i = pil2tensor(i)
            ui = ALL_NODE["PreviewImage"]().save_images(i)["ui"]
            return {"ui":ui, "result":(results[0],results[1],results[2],path)}
        else:
            return (results[0],results[1],results[2],path)
        
class LoraLoader:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"lora_lib.json")
    with open(model_lib_path, 'r') as json_file:
        loralist = json.load(json_file)
    lora_full_list = list(set(folder_paths.get_filename_list("loras") + list(loralist)))
    lora_full_list.sort()
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Download": ("BOOLEAN", {"default": True},),
                "Download_url": ("STRING", {"default": "", "multiline": False},),
                "Lora_url_name": ("STRING", {"default": "model.safetensors", "multiline": False},),
                "lora_name": (none2list(s.lora_full_list), {"default": "None", "tooltip": "The name of the LoRA."}),
            },
            "optional": {
                "model": ("MODEL", {"tooltip": "The diffusion model the LoRA will be applied to."}),
                "clip": ("CLIP", {"default": None, "tooltip": "The CLIP model the LoRA will be applied to."}),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01, "tooltip": "How strongly to modify the diffusion model. This value can be negative."}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01, "tooltip": "How strongly to modify the CLIP model. This value can be negative."}),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("model", "clip", "lora_path")
    FUNCTION = "load_lora"
    CATEGORY = "📂 SDVN"

    def load_lora(self, Download, Download_url, Lora_url_name, lora_name, model = None, clip = None, strength_model=1, strength_clip=1):
        strength_clip = 0 if clip == None else strength_clip
        if not Download or Download_url == '':
            if lora_name == "None":
                return (model, clip)
            if lora_name in self.loralist:
                Download = True
                Download_url = self.loralist[lora_name]
                Lora_url_name = lora_name
        if Download and Download_url != '':
            download_model(Download_url, Lora_url_name, "loras")
            lora_name = Lora_url_name
        path = folder_paths.get_full_path_or_raise("loras", lora_name)
        index = 0
        if not Download or Download_url == '':
            name = lora_name.split("/")[-1].rsplit(".", 1)[0]
            for i in ["jpg","jpeg","png"]:
                if os.path.exists(os.path.join(os.path.dirname(path),f"{name}.{i}")):
                    i_cover = os.path.join(os.path.dirname(path),f"{name}.{i}")
                    index += 1
        if model == None and clip == None:
            results = (None, None,)
        else:
            results = ALL_NODE["LoraLoader"]().load_lora(model, clip, lora_name, strength_model, strength_clip)
        if index > 0:
            i = Image.open(i_cover)
            i = pil2tensor(i)
            ui = ALL_NODE["PreviewImage"]().save_images(i)["ui"]
            return {"ui":ui, "result":(results[0],results[1],path)}
        else:
            return (results[0],results[1],path)

class CLIPTextEncode:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "positive": ("STRING", {"multiline": True}),
                "negative": ("STRING", {"multiline": True}),
                "style": (none2list(style_list()[0]),{"default": "None"}),
                "translate": (lang_list(),),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "clip": ("CLIP", {"tooltip": "The CLIP model used for encoding the text."})
            }
        }
    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "STRING")
    RETURN_NAMES = ("positive", "negative", "prompt")
    OUTPUT_TOOLTIPS = (
        "A conditioning containing the embedded text used to guide the diffusion model.",)
    FUNCTION = "encode"

    CATEGORY = "📂 SDVN"
    DESCRIPTION = "Encodes a text prompt using a CLIP model into an embedding that can be used to guide the diffusion model towards generating specific images."

    def encode(self, clip, positive, negative, style, translate, seed):
        if style != "None":
            positive = f"{positive}, {style_list()[1][style_list()[0].index(style)][1]}"
            negative = f"{negative}, {style_list()[1][style_list()[0].index(style)][2]}" if len(style_list()[1][style_list()[0].index(style)]) > 2 else ""
        if "DPRandomGenerator" in ALL_NODE:
            cls = ALL_NODE["DPRandomGenerator"]
            positive = cls().get_prompt(positive, seed, 'No')[0]
            negative = cls().get_prompt(negative, seed, 'No')[0]
        positive = ALL_NODE["SDVN Translate"]().ggtranslate(positive,translate)[0]
        negative = ALL_NODE["SDVN Translate"]().ggtranslate(negative,translate)[0]
        prompt =f"""
Positive: {positive}

Negative: {negative}
        """
        token_p = clip.tokenize(positive)
        token_n = clip.tokenize(negative)
        return (clip.encode_from_tokens_scheduled(token_p), clip.encode_from_tokens_scheduled(token_n), prompt)

class StyleLoad:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "positive": ("STRING", {"multiline": True}),
                "negative": ("STRING", {"multiline": True}),
                "style": (none2list(style_list()[0]),{"default": "None"}),
                "style2": (none2list(style_list()[0]),{"default": "None"}),
                "style3": (none2list(style_list()[0]),{"default": "None"}),
                "style4": (none2list(style_list()[0]),{"default": "None"}),
                "style5": (none2list(style_list()[0]),{"default": "None"}),
                "style6": (none2list(style_list()[0]),{"default": "None"}),
                "translate": (lang_list(),),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
            }
        }
    RETURN_TYPES = ("STRING", "STRING",)
    RETURN_NAMES = ("positive", "negative",)
    FUNCTION = "loadstyle"

    CATEGORY = "📂 SDVN"
    DESCRIPTION = "Encodes a text prompt using a CLIP model into an embedding that can be used to guide the diffusion model towards generating specific images."

    def loadstyle(self, positive, negative, translate, seed, **kargs):
        print(kargs)
        for i in kargs:
            if kargs[i] != "None":
                positive = f"{positive}, {style_list()[1][style_list()[0].index(kargs[i])][1]}"
                negative = f"{negative}, {style_list()[1][style_list()[0].index(kargs[i])][2]}" if len(style_list()[1][style_list()[0].index(kargs[i])]) > 2 else ""
        if "DPRandomGenerator" in ALL_NODE:
            cls = ALL_NODE["DPRandomGenerator"]
            positive = cls().get_prompt(positive, seed, 'No')[0]
            negative = cls().get_prompt(negative, seed, 'No')[0]
        positive = ALL_NODE["SDVN Translate"]().ggtranslate(positive,translate)[0]
        negative = ALL_NODE["SDVN Translate"]().ggtranslate(negative,translate)[0]
        return (positive,negative,)
    
ModelType_list = {
    "SD 1.5": [7.0, "euler_ancestral", "normal"],
    "SDXL": [9.0, "dpmpp_2m_sde", "karras"],
    "Flux": [1.0, "euler", "simple"],
    "SD 1.5 Hyper": [1.0, "euler_ancestral", "sgm_uniform"],
    "SDXL Hyper": [1.0, "euler_ancestral", "sgm_uniform"],
    "SDXL Lightning": [1.0, "dpmpp_2m_sde", "sgm_uniform"],
    "HiDream": [5.0, "uni_pc", "simple"],
    "HiDream-Dev": [1.0, "lcm", "normal"],
    "HiDream-Fast": [1.0, "lcm", "normal"],
    "WAN21": [6.0,"uni_pc", "simple"],
    "HunyuanVideo": [1.0, "euler", "simple"],
}

StepsType_list = {
    "Denoise": 20,
    "Lightning 8steps": 8,
    "Hyper 8steps": 8,
    "Lightning 4steps": 4,
    "Hyper 4steps": 4,
    "Flux dev turbo (hyper 8steps)": 8,
    "Flux schnell": 4,
    "HiDream-Fast": 16,
}

def check_type_model(m):
    type_name = m.model.__class__.__name__
    type_name = "SD 1.5" if type_name == "BaseModel" else type_name
    return type_name

class Easy_KSampler:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "The model used for denoising the input latent."}),
                "positive": ("CONDITIONING", {"tooltip": "The conditioning describing the attributes you want to include in the image."}),
                "ModelType": (["None","Auto",*list(ModelType_list)],),
                "StepsType": (none2list(list(StepsType_list)),),
                "denoise": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01, "tooltip": "The amount of denoising applied, lower values will maintain the structure of the initial image allowing for image to image sampling."}),
                "steps": ("INT", {"default": 20, "min": 1, "max": 10000, "tooltip": "The number of steps used in the denoising process."}),
                "cfg": ("FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "The Classifier-Free Guidance scale balances creativity and adherence to the prompt. Higher values result in images more closely matching the prompt however too high values will negatively impact quality."}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "The algorithm used when sampling, this can affect the quality, speed, and style of the generated output."}),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"tooltip": "The scheduler controls how noise is gradually removed to form the image."}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed used for creating the noise."}),
                "Tiled": ("BOOLEAN", {"default": False},),
            },
            "optional": {
                "negative": ("CONDITIONING", {"tooltip": "The conditioning describing the attributes you want to exclude from the image."}),
                "latent_image": ("LATENT", {"tooltip": "The latent image to denoise."}),
                "vae": ("VAE", {"tooltip": "The VAE model used for decoding the latent."}),
                "tile_width": ("INT", {"default": 1024, "min": 512, "max": 4096, "step": 64, }),
                "tile_height": ("INT", {"default": 1024, "min": 512, "max": 4096, "step": 64, }),
                "FluxGuidance":  ("FLOAT", {"default": 3.5, "min": 0.0, "max": 100.0, "step": 0.1}),
            }
        }

    RETURN_TYPES = ("LATENT", "IMAGE",)
    OUTPUT_TOOLTIPS = ("The denoised latent.",)
    FUNCTION = "sample"

    CATEGORY = "📂 SDVN"
    DESCRIPTION = "Uses the provided model, positive and negative conditioning to denoise the latent image."
    
    def sample(self, model, positive, ModelType, StepsType, sampler_name, scheduler, seed, Tiled=False, tile_width=None, tile_height=None, steps=20, cfg=7, denoise=1.0, negative=None, latent_image=None, vae=None, FluxGuidance = 3.5):
        if ModelType == "Auto":
            ModelType = check_type_model(model)
        ModelType == 'None' if ModelType not in ModelType_list else ModelType
        if ModelType != 'None':
            cfg, sampler_name, scheduler = ModelType_list[ModelType]
        StepsType_list["Denoise"] = steps
        if FluxGuidance != 3.5:
            positive = ALL_NODE["FluxGuidance"]().append(positive,FluxGuidance)[0]
        if negative == None:
            cls_zero_negative = ALL_NODE["ConditioningZeroOut"]
            negative = cls_zero_negative().zero_out(positive)[0]
        if tile_width == None or tile_height == None:
            tile_width = tile_height = 1024
        if latent_image == None:
            cls_emply = ALL_NODE["EmptyLatentImage"]
            latent_image = cls_emply().generate(tile_width, tile_height, 1)[0]
            tile_width = int(math.ceil(tile_width/2))
            tile_height = int(math.ceil(tile_width/2))
        if Tiled == True:
            if "TiledDiffusion" in ALL_NODE:
                cls_tiled = ALL_NODE["TiledDiffusion"]
                model = cls_tiled().apply(model, "Mixture of Diffusers",
                                          tile_width, tile_height, 96, 4)[0]
            else:
                print(
                    'Not install TiledDiffusion node (https://github.com/shiimizu/ComfyUI-TiledDiffusion)')
        if StepsType != 'None':
            steps = int(math.ceil(StepsType_list[StepsType]*denoise))
        cls = ALL_NODE["KSampler"]
        samples = cls().sample(model, seed, steps, cfg, sampler_name,
                               scheduler, positive, negative, latent_image, denoise)[0]
        if vae != None:
            cls_decode = ALL_NODE["VAEDecode"]
            images = cls_decode().decode(vae, samples)[0]
        else:
            images = None
        return (samples, images,)


class UpscaleImage:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib_any.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)
    list_upscale_model = []
    for key, value in modellist.items():
        if value[1] == "UpscaleModel":
            list_upscale_model.append(key)
    list_full_upscale_model = list(set(list_upscale_model+folder_paths.get_filename_list("upscale_models")))
    list_full_upscale_model.sort()
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "mode": (["Maxsize", "Resize", "Scale"], ),
            "model_name": (none2list(s.list_full_upscale_model), {"default": "None", }),
            "scale": ("FLOAT", {"default": 1, "min": 0, "max": 10, "step": 0.01, }),
            "width": ("INT", {"default": 1024, "min": 0, "max": 4096, "step": 1, }),
            "height": ("INT", {"default": 1024, "min": 0, "max": 4096, "step": 1, }),
            "image": ("IMAGE",),
        }}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "upscale"

    CATEGORY = "📂 SDVN/🏞️ Image"

    def upscale(self, mode, width, height, scale, model_name, image):
        if width == 0 and height == 0:
            s = image
        else:
            samples = image.movedim(-1, 1)
            w = samples.shape[3]
            h = samples.shape[2]
            if mode == 'Maxsize':
                if width/height < w/h:
                    height = round(h * width / w)
                else:
                    width = round(w * height / h)
            if mode == 'Scale':
                width = round(w * scale)
                height = round(h * scale)
            if width == 0:
                width = max(1, round(w * height / h))
            elif height == 0:
                height = max(1, round(h * width / w))
            if model_name != "None":
                if model_name in self.modellist:
                    upscale_model = ALL_NODE["SDVN AnyDownload List"]().any_download_list(model_name)[0]
                else:
                    upscale_model = ALL_NODE["UpscaleModelLoader"]().load_model(model_name)[0]
                image = ALL_NODE["ImageUpscaleWithModel"]().upscale(
                    upscale_model, image)[0]
            samples = image.movedim(-1, 1)
            s = comfy.utils.common_upscale(
                samples, width, height, "nearest-exact", "disabled")
            s = s.movedim(1, -1)
        return (s,)


class UpscaleLatentImage:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib_any.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)
    list_upscale_model = []
    for key, value in modellist.items():
        if value[1] == "UpscaleModel":
            list_upscale_model.append(key)
    list_full_upscale_model = list(set(list_upscale_model+folder_paths.get_filename_list("upscale_models")))
    list_full_upscale_model.sort()
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "mode": (["Maxsize", "Resize", "Scale"], ),
            "model_name": (none2list(s.list_full_upscale_model), {"default": "None", }),
            "scale": ("FLOAT", {"default": 2, "min": 0, "max": 10, "step": 0.01, }),
            "width": ("INT", {"default": 1024, "min": 0, "max": 4096, "step": 1, }),
            "height": ("INT", {"default": 1024, "min": 0, "max": 4096, "step": 1, }),
            "latent": ("LATENT",),
            "vae": ("VAE",),
        }}

    RETURN_TYPES = ("LATENT", "VAE",)
    FUNCTION = "upscale_latent"

    CATEGORY = "📂 SDVN/🏞️ Image"

    def upscale_latent(self, mode, width, height, scale, model_name, latent, vae):
        image = ALL_NODE["VAEDecode"]().decode(vae, latent)[0]
        s = UpscaleImage().upscale(mode, width, height,
                                   scale, model_name, image)[0]
        l = ALL_NODE["VAEEncode"]().encode(vae, s)[0]
        return (l, vae,)


def preprocessor_list():
    preprocessor_list = ["None","InvertImage"]
    AIO_NOT_SUPPORTED = ["InpaintPreprocessor",
                         "MeshGraphormer+ImpactDetector-DepthMapPreprocessor", "DiffusionEdge_Preprocessor"]
    AIO_NOT_SUPPORTED += ["SavePoseKpsAsJsonFile", "FacialPartColoringFromPoseKps",
                          "UpperBodyTrackingFromPoseKps", "RenderPeopleKps", "RenderAnimalKps"]
    AIO_NOT_SUPPORTED += ["Unimatch_OptFlowPreprocessor", "MaskOptFlow"]
    for k in ALL_NODE:
        if "Preprocessor" in k and "Inspire" not in k:
            if k not in AIO_NOT_SUPPORTED:
                preprocessor_list += [k]
    return preprocessor_list

class AutoControlNetApply:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib_any.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)
    list_controlnet_model = []
    for key, value in modellist.items():
        if value[1] == "Controlnet":
            list_controlnet_model.append(key)
    list_full_controlnet_model = list(set(folder_paths.get_filename_list("controlnet") + list_controlnet_model))
    list_full_controlnet_model.sort()
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
                             "image": ("IMAGE", ),
                             "control_net": (none2list(s.list_full_controlnet_model),),
                             "preprocessor": (preprocessor_list(),),
                             "union_type": (["None","auto"] + list(UNION_CONTROLNET_TYPES.keys()),),
                             "resolution": ("INT", {"default": 512, "min": 512, "max": 2048, "step": 1}),
                             "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.01}),
                             "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                             "end_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001})
                             },
                "optional": {
                            "positive": ("CONDITIONING", ),
                            "negative": ("CONDITIONING", ),
                            "vae": ("VAE", ),
                            "mask": ("MASK", ),
                             }
                }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "IMAGE", "PARAMETER")
    RETURN_NAMES = ("positive", "negative", "image", "parameter")
    FUNCTION = "apply_controlnet"

    CATEGORY = "📂 SDVN"

    def apply_controlnet(self, image, control_net, preprocessor, union_type, resolution, strength, start_percent, end_percent, mask = None, vae=None, positive = None, negative = None):
        para = {"controlnet": [image, control_net, preprocessor, union_type, resolution, strength, start_percent, end_percent, mask]}
        if control_net == "None" or positive == None or negative == None:
            return (positive, negative, image, para)
        if preprocessor == "InvertImage":
            image = ALL_NODE["ImageInvert"]().invert(image)[0]
        elif preprocessor != "None":
            if "AIO_Preprocessor" in ALL_NODE:
                r = ALL_NODE["AIO_Preprocessor"]().execute(preprocessor, image, resolution)
                if "result" in r:
                    image = r["result"][0]
                else:
                    image = r[0]
            else:
                print(
                    "You have not installed it yet Controlnet Aux (https://github.com/Fannovel16/comfyui_controlnet_aux)")
        if control_net in self.modellist:
            control_net = ALL_NODE["SDVN AnyDownload List"]().any_download_list(control_net)[0]
        else:
            control_net = ALL_NODE["ControlNetLoader"]().load_controlnet(control_net)[0]
        if union_type != "None":
            control_net = ALL_NODE["SetUnionControlNetType"]().set_controlnet_type(control_net,union_type)[0]
        if mask == None:
            p, n = ALL_NODE["ControlNetApplyAdvanced"]().apply_controlnet(positive, negative, control_net, image, strength, start_percent, end_percent, vae)
        else:
            p, n = ALL_NODE["ControlNetInpaintingAliMamaApply"]().apply_inpaint_controlnet(positive, negative, control_net, vae, image, mask, strength, start_percent, end_percent)
        results = ALL_NODE["PreviewImage"]().save_images(image)
        results["result"] = (p, n, image, para)
        return results

class Inpaint:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"SetLatentNoiseMask":("BOOLEAN",),
                             "pixels": ("IMAGE", ),
                             "vae": ("VAE", ),},
                "optional": {"mask": ("MASK", ),
                             "positive": ("CONDITIONING", ),
                             "negative": ("CONDITIONING", ),}
                             }

    RETURN_TYPES = ("CONDITIONING","CONDITIONING","LATENT",)
    RETURN_NAMES = ("positive", "negative","latent",)
    FUNCTION = "encode"

    CATEGORY = "📂 SDVN"

    def encode(self, SetLatentNoiseMask, pixels, vae, mask = None, positive = None, negative = None):
        if SetLatentNoiseMask or mask == None:
            r = ALL_NODE["VAEEncode"]().encode(vae,pixels)[0]
            if mask != None:
                r = ALL_NODE["SetLatentNoiseMask"]().set_mask(r, mask)[0]
        elif positive == None or negative == None:
            r = ALL_NODE["VAEEncodeForInpaint"]().encode(vae, pixels, mask)[0]
        else:
            r = ALL_NODE["InpaintModelConditioning"]().encode(positive, negative, pixels, vae, mask)
            positive = r[0]
            negative = r[1]
            r = r[2]
        return (positive,negative,r,)

#Apply style Redux

def standardizeMask(mask):
    if mask is None:
        return None
    if len(mask.shape) == 2:
        (h,w)=mask.shape
        mask=mask.view(1,1,h,w)
    elif len(mask.shape)==3:
        (b,h,w)=mask.shape
        mask=mask.view(b,1,h,w)
    return mask

def crop(img, mask, box, desiredSize):
    (ox,oy,w,h) = box
    if mask is not None:
        mask=torch.nn.functional.interpolate(mask, size=(h,w), mode="bicubic").view(-1,h,w,1)
    img = torch.nn.functional.interpolate(img.transpose(-1,1), size=(w,h), mode="bicubic", antialias=True)
    return (img[:, :, ox:(desiredSize+ox), oy:(desiredSize+oy)].transpose(1,-1), None if mask == None else mask[:, oy:(desiredSize+oy), ox:(desiredSize+ox),:])

def letterbox(img, mask, w, h, desiredSize):
    (b,oh,ow,c) = img.shape
    img = torch.nn.functional.interpolate(img.transpose(-1,1), size=(w,h), mode="bicubic", antialias=True).transpose(1,-1)
    letterbox = torch.zeros(size=(b,desiredSize,desiredSize, c))
    offsetx = (desiredSize-w)//2
    offsety = (desiredSize-h)//2
    letterbox[:, offsety:(offsety+h), offsetx:(offsetx+w), :] += img
    img = letterbox
    if mask is not None:
        mask=torch.nn.functional.interpolate(mask, size=(h,w), mode="bicubic")
        letterbox = torch.zeros(size=(b,1,desiredSize,desiredSize))
        letterbox[:, :, offsety:(offsety+h), offsetx:(offsetx+w)] += mask
        mask = letterbox.view(b,1,desiredSize,desiredSize)
    return (img, mask)

def getBoundingBox(mask, w, h, relativeMargin, desiredSize):
    mask=mask.view(h,w)
    marginW = math.ceil(relativeMargin * w)
    marginH = math.ceil(relativeMargin * h)
    indices = torch.nonzero(mask, as_tuple=False)
    y_min, x_min = indices.min(dim=0).values
    y_max, x_max = indices.max(dim=0).values    
    x_min = max(0, x_min.item() - marginW)
    y_min = max(0, y_min.item() - marginH)
    x_max = min(w, x_max.item() + marginW)
    y_max = min(h, y_max.item() + marginH)
    
    box_width = x_max - x_min
    box_height = y_max - y_min
    
    larger_edge = max(box_width, box_height, desiredSize)
    if box_width < larger_edge:
        delta = larger_edge - box_width
        left_space = x_min
        right_space = w - x_max
        expand_left = min(delta // 2, left_space)
        expand_right = min(delta - expand_left, right_space)
        expand_left += min(delta - (expand_left+expand_right), left_space-expand_left)
        x_min -= expand_left
        x_max += expand_right

    if box_height < larger_edge:
        delta = larger_edge - box_height
        top_space = y_min
        bottom_space = h - y_max
        expand_top = min(delta // 2, top_space)
        expand_bottom = min(delta - expand_top, bottom_space)
        expand_top += min(delta - (expand_top+expand_bottom), top_space-expand_top)
        y_min -= expand_top
        y_max += expand_bottom

    x_min = max(0, x_min)
    y_min = max(0, y_min)
    x_max = min(w, x_max)
    y_max = min(h, y_max)
    return x_min, y_min, x_max, y_max


def patchifyMask(mask, patchSize=14):
    if mask is None:
        return mask
    (b, imgSize, imgSize,_) = mask.shape
    toks = imgSize//patchSize
    return torch.nn.MaxPool2d(kernel_size=(patchSize,patchSize),stride=patchSize)(mask.view(b,imgSize,imgSize)).view(b,toks,toks,1)

def prepareImageAndMask(image, mask, mode, autocrop_margin, desiredSize=384):
    mode = IMAGE_MODES.index(mode)
    (B,H,W,C) = image.shape
    if mode==1:
        imgsize = min(H,W)
        ratio = desiredSize/imgsize
        (w,h) = (round(W*ratio), round(H*ratio))
        image, mask = crop(image, standardizeMask(mask), ((w - desiredSize)//2, (h - desiredSize)//2, w, h), desiredSize)
    elif mode==0:
        if mask is None:
            mask = torch.ones(size=(B,H,W))
        imgsize = max(H,W)
        ratio = desiredSize/imgsize
        (w,h) = (round(W*ratio), round(H*ratio))
        image, mask = letterbox(image, standardizeMask(mask), w, h, desiredSize)
    elif mode==2:
        (bx,by,bx2,by2) = getBoundingBox(mask,W,H,autocrop_margin, desiredSize)
        image = image[:,by:by2,bx:bx2,:]
        mask = mask[:,by:by2,bx:bx2]
        imgsize = max(bx2-bx,by2-by)
        ratio = desiredSize/imgsize
        (w,h) = (round((bx2-bx)*ratio), round((by2-by)*ratio))
        image, mask = letterbox(image, standardizeMask(mask), w, h, desiredSize)
    return (image,mask)

IMAGE_MODES = [
    "none",
    "center",
    "mask crop"
]

class ApplyStyleModel:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib_any.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)
    list_style_model = []
    list_vision_model = []
    for key, value in modellist.items():
        if value[1] == "StyleModel":
            list_style_model.append(key)
        if value[1] == "CLIPVision":
            list_vision_model.append(key)
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
                    "image": ("IMAGE",),
                    "style_model": (list(set(folder_paths.get_filename_list("style_models") + s.list_style_model)), ),
                    "clip_vision_model": (list(set(folder_paths.get_filename_list("clip_vision") + s.list_vision_model)), ),
                    "mode": (IMAGE_MODES, {"default": "none"}),
                    "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.1}),
                    "downsampling":("INT", {"default": 1, "min": 0, "max": 6, "step": 1}),
                             },
                "optional": {
                    "mask": ("MASK", ),
                    "positive": ("CONDITIONING", ),
                },
                             }
    
    RETURN_TYPES = ("CONDITIONING", "PARAMETER",)
    RETURN_NAMES = ("positive", "parameter")
    FUNCTION = "applystyle"

    CATEGORY = "📂 SDVN"

    def applystyle(s, image, style_model, clip_vision_model, mode, strength, downsampling, mask = None, positive = None):
        para = {"applystyle": [image, style_model, clip_vision_model, mode, strength, downsampling, mask]}
        if positive != None:
            vision_size = 384 if "384" in clip_vision_model else 512
            if clip_vision_model in s.modellist:
                clip_vision_model = ALL_NODE["SDVN AnyDownload List"]().any_download_list(clip_vision_model)[0]
            else:
                clip_vision_model = ALL_NODE["CLIPVisionLoader"]().load_clip(clip_vision_model)[0]
            if mask is not None:
                print("! Mask mode only works with Redux 384")
                image, masko = prepareImageAndMask(image, mask, mode, 0.1, vision_size)
                mask = patchifyMask(masko, 16 if vision_size == 512 else 14)
            crop_mode = "none" if mode != "center" else "center"
            clip_vision_encode = ALL_NODE["CLIPVisionEncode"]().encode(clip_vision_model, image, crop_mode)[0]
            if style_model in s.modellist:
                style_model = ALL_NODE["SDVN AnyDownload List"]().any_download_list(style_model)[0]
            else:
                style_model = ALL_NODE["StyleModelLoader"]().load_style_model(style_model)[0]

            mode="area" if downsampling==3 else "bicubic"
            cond = style_model.get_cond(clip_vision_encode).flatten(start_dim=0, end_dim=1).unsqueeze(dim=0)
            (b,t,h)=cond.shape
            m = int(np.sqrt(t))
            if downsampling>1:
                cond = cond.view(b, m, m, h)
                if mask is not None:
                    cond = cond*mask
                cond=torch.nn.functional.interpolate(cond.view(b, m, m, h).transpose(1,-1), size=(m//downsampling, m//downsampling), mode=mode)#
                cond=cond.transpose(1,-1).reshape(b,-1,h)
                mask = None if mask is None else torch.nn.functional.interpolate(mask.view(b, m, m, 1).transpose(1,-1), size=(m//downsampling, m//downsampling), mode=mode).transpose(-1,1)
            cond = cond*(strength*strength)
            c = []
            if mask is not None:
                mask = (mask>0).reshape(b,-1)
                max_len = mask.sum(dim=1).max().item()
                padded_embeddings = torch.zeros((b, max_len, h), dtype=cond.dtype, device=cond.device)
                for i in range(b):
                    filtered = cond[i][mask[i]]
                    padded_embeddings[i, :filtered.size(0)] = filtered
                cond = padded_embeddings
            for t in positive:
                n = [torch.cat((t[0], cond), dim=1), t[1].copy()]
                c.append(n)
            return (c, para, )
        else:
            return (positive, para)

class KontextReference:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
                    "img_size": ("INT",  {"default": 0, "min": 0, "max": 4096, "step": 1}),
                    "conditioning": ("CONDITIONING", ),
                    "vae": ("VAE", ),
                             },
                "optional": {
                     "image": ("IMAGE",),
                     "image2": ("IMAGE",),
                     "image3": ("IMAGE",),
                },
                             }
    
    RETURN_TYPES = ("CONDITIONING", "INT", "INT")
    RETURN_NAMES= ("conditioning", "width", "height")
    FUNCTION = "append"

    CATEGORY = "📂 SDVN"

    def append(s, img_size, conditioning, vae, image, image2=None, image3=None):
        img_list = [image, image2, image3]
        for img in img_list:
            if img is not None:
                width, height = ALL_NODE["SDVN Image Size"]().imagesize(image = image, latent = None, maxsize = img_size)
                break
            else:
                width, height = img_size, img_size
        for img in img_list:
            if img is not None:
                img = ALL_NODE["SDVN Image Layout"]().layout(["row"], [height],[""], ["left"], [40], [image], [image2], [image3])[0]
                latent = ALL_NODE["VAEEncode"]().encode(vae, img)[0]
                break
            else:
                latent = None
        conditioning = ALL_NODE["ReferenceLatent"]().append(conditioning, latent)[0]
        return (conditioning,width,height,)

class CheckpointDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Download_url": ("STRING", {"default": "", "multiline": False},),
                "Ckpt_url_name": ("STRING", {"default": "model.safetensors", "multiline": False},),
            }
        }
    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    OUTPUT_TOOLTIPS = ("The model used for denoising latents.",
                       "The CLIP model used for encoding text prompts.",
                       "The VAE model used for encoding and decoding images to and from latent space.")
    FUNCTION = "checkpoint_download"

    CATEGORY = "📂 SDVN/📥 Download"

    def checkpoint_download(self, Download_url, Ckpt_url_name):
        download_model(Download_url, Ckpt_url_name, "checkpoints")
        return ALL_NODE["CheckpointLoaderSimple"]().load_checkpoint(Ckpt_url_name)
    
class CheckpointDownloadList:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Model": (list(s.modellist),),
            }
        }
    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    FUNCTION = "checkpoint_download_list"

    CATEGORY = "📂 SDVN/📥 Download"

    def checkpoint_download_list(s, Model): 
        return  ALL_NODE["SDVN Checkpoint Download"]().checkpoint_download(s.modellist[Model], Model)
    
class LoraDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "The diffusion model the LoRA will be applied to."}),
                "clip": ("CLIP", {"default": None, "tooltip": "The CLIP model the LoRA will be applied to."}),
                "Download_url": ("STRING", {"default": "", "multiline": False},),
                "Lora_url_name": ("STRING", {"default": "model.safetensors", "multiline": False},),
                "strength_model": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01, "tooltip": "How strongly to modify the diffusion model. This value can be negative."}),
                "strength_clip": ("FLOAT", {"default": 1.0, "min": -100.0, "max": 100.0, "step": 0.01, "tooltip": "How strongly to modify the CLIP model. This value can be negative."}),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    OUTPUT_TOOLTIPS = ("The modified diffusion model.",
                       "The modified CLIP model.")
    FUNCTION = "load_lora"

    CATEGORY = "📂 SDVN/📥 Download"
    DESCRIPTION = "LoRAs are used to modify diffusion and CLIP models, altering the way in which latents are denoised such as applying styles. Multiple LoRA nodes can be linked together."

    def load_lora(self, model, clip, Download_url, Lora_url_name, strength_model, strength_clip):
        download_model(Download_url, Lora_url_name, "loras")
        return ALL_NODE["LoraLoader"]().load_lora(model, clip, Lora_url_name, strength_model, strength_clip)

class CLIPVisionDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False},)
                             }}
    RETURN_TYPES = ("CLIP_VISION",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name):
        download_model(Download_url, Url_name, "clip_vision")
        return ALL_NODE["CLIPVisionLoader"]().load_clip(Url_name)

class UpscaleModelDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False},)
                             }}
    RETURN_TYPES = ("UPSCALE_MODEL",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name):
        download_model(Download_url, Url_name, "upscale_models")
        return ALL_NODE["UpscaleModelLoader"]().load_model(Url_name)

class VAEDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False},)
                             }}
    RETURN_TYPES = ("VAE",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name):
        download_model(Download_url, Url_name, "vae")
        return ALL_NODE["VAELoader"]().load_vae(Url_name)

class ControlNetDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False},)
                             }}
    RETURN_TYPES = ("CONTROL_NET",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name):
        download_model(Download_url, Url_name, "controlnet")
        return ALL_NODE["ControlNetLoader"]().load_controlnet(Url_name)

class UNETDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False}),
                    "weight_dtype": (["default", "fp8_e4m3fn", "fp8_e4m3fn_fast", "fp8_e5m2"],)
                             }}
    RETURN_TYPES = ("MODEL",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name, weight_dtype):
        download_model(Download_url, Url_name, "diffusion_models")
        return ALL_NODE["UNETLoader"]().load_unet(Url_name,weight_dtype)

class CLIPDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False}),
                    "type": (["stable_diffusion", "stable_cascade", "sd3", "stable_audio", "mochi", "ltxv", "pixart", "cosmos", "lumina2", "wan", "hidream"],)
                             }}
    RETURN_TYPES = ("CLIP",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name, type):
        download_model(Download_url, Url_name, "text_encoders")
        return ALL_NODE["CLIPLoader"]().load_clip(Url_name,type)

class StyleModelDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False},)
                             }}
    RETURN_TYPES = ("STYLE_MODEL",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name):
        download_model(Download_url, Url_name, "style_models")
        return ALL_NODE["StyleModelLoader"]().load_style_model(Url_name)

class IPAdapterModelDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False},)
                             }}
    RETURN_TYPES = ("IPADAPTER",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name):
        download_model(Download_url, Url_name, "ipadapter")
        return ALL_NODE["IPAdapterModelLoader"]().load_ipadapter_model(Url_name)

class InstantIDModelDownload:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "Download_url": ("STRING", {"default": "", "multiline": False},),
                    "Url_name": ("STRING", {"default": "model.safetensors", "multiline": False},)
                             }}
    RETURN_TYPES = ("INSTANTID",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(self, Download_url, Url_name):
        download_model(Download_url, Url_name, "instantid")
        return ALL_NODE["InstantIDModelLoader"]().load_model(Url_name)

class DualClipDownload:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib_any.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)
    list_clip = []
    for key, value in modellist.items():
        if value[1] == "CLIP":
            list_clip.append(key)
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "CLIP_name1": (s.list_clip,),
                    "CLIP_name2": (s.list_clip,),
                    "type": (["sdxl", "sd3", "flux", "hunyuan_video", "hidream"], ),
                             }}
    RETURN_TYPES = ("CLIP",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(s, CLIP_name1, CLIP_name2, type):
        download_model(s.modellist[CLIP_name1][0], CLIP_name1, "text_encoders")
        download_model(s.modellist[CLIP_name2][0], CLIP_name2, "text_encoders")
        return ALL_NODE["DualCLIPLoader"]().load_clip(CLIP_name1, CLIP_name2, type, device="default")
    
class QuadrupleCLIPDownload:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib_any.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)
    list_clip = []
    for key, value in modellist.items():
        if value[1] == "CLIP":
            list_clip.append(key)
    @classmethod
    def INPUT_TYPES(s):
        return {"required": { 
                    "CLIP_name1": (s.list_clip,),
                    "CLIP_name2": (s.list_clip,),
                    "CLIP_name3": (s.list_clip,),
                    "CLIP_name4": (s.list_clip,),
                             }}
    RETURN_TYPES = ("CLIP",)
    FUNCTION = "download"

    CATEGORY = "📂 SDVN/📥 Download"

    def download(s, CLIP_name1, CLIP_name2, CLIP_name3, CLIP_name4):
        download_model(s.modellist[CLIP_name1][0], CLIP_name1, "text_encoders")
        download_model(s.modellist[CLIP_name2][0], CLIP_name2, "text_encoders")
        download_model(s.modellist[CLIP_name3][0], CLIP_name3, "text_encoders")
        download_model(s.modellist[CLIP_name4][0], CLIP_name4, "text_encoders")
        return ALL_NODE["QuadrupleCLIPLoader"]().load_clip(CLIP_name1, CLIP_name2, CLIP_name3, CLIP_name4)
    
class AnyDownloadList:
    model_lib_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),"model_lib_any.json")
    with open(model_lib_path, 'r') as json_file:
        modellist = json.load(json_file)

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Model": (list(s.modellist),),
            },
        }
    RETURN_TYPES = (any,)
    RETURN_NAMES = ("any_model",)
    FUNCTION = "any_download_list"

    CATEGORY = "📂 SDVN/📥 Download"

    def any_download_list(s, Model):
        download_link =  s.modellist[Model][0]
        model_name = Model
        Type = s.modellist[Model][1]
        if Type == "Controlnet":
            r = ALL_NODE["SDVN ControlNet Download"]().download(download_link, model_name)[0]
        if Type == "CLIPVision":
            r = ALL_NODE["SDVN CLIPVision Download"]().download(download_link, model_name)[0]
        if Type == "UpscaleModel":
            r = ALL_NODE["SDVN UpscaleModel Download"]().download(download_link, model_name)[0]
        if Type == "VAE":
            r = ALL_NODE["SDVN VAE Download"]().download(download_link, model_name)[0]
        if Type == "UNET/Diffusion":
            weight_dtype = s.modellist[Model][2]
            r = ALL_NODE["SDVN UNET Download"]().download(download_link, model_name, weight_dtype)[0]
        if Type == "CLIP":
            ClipType = s.modellist[Model][2]
            r = ALL_NODE["SDVN CLIP Download"]().download(download_link, model_name, ClipType)[0]
        if Type == "IPAdapterModel":
            r = ALL_NODE["SDVN IPAdapterModel Download"]().download(download_link, model_name)[0]
        if Type == "InstatnIDModel":
            r = ALL_NODE["SDVN InstantIDModel Download"]().download(download_link, model_name)[0]
        if Type == "StyleModel":
            r = ALL_NODE["SDVN StyleModel Download"]().download(download_link, model_name)[0]
        return  (r,)

NODE_CLASS_MAPPINGS = {
    "SDVN Load Checkpoint": CheckpointLoaderDownload,
    "SDVN Load Lora": LoraLoader,
    "SDVN Load Image": LoadImage,
    "SDVN Load Image Folder": LoadImageFolder,
    "SDVN Load Image Url": LoadImageUrl,
    "SDVN LoadPinterest": LoadPinterest,
    "SDVN Load Image Ultimate": LoadImageUltimate,
    "SDVN CLIP Text Encode": CLIPTextEncode,
    "SDVN Controlnet Apply": AutoControlNetApply,
    "SDVN Inpaint": Inpaint,
    "SDVN Apply Style Model": ApplyStyleModel,
    "SDVN KSampler": Easy_KSampler,
    "SDVN Styles":StyleLoad, 
    "SDVN Upscale Image": UpscaleImage,
    "SDVN UPscale Latent": UpscaleLatentImage,
    "SDVN Checkpoint Download": CheckpointDownload,
    "SDVN Checkpoint Download List": CheckpointDownloadList,
    "SDVN Lora Download": LoraDownload,
    "SDVN CLIPVision Download":CLIPVisionDownload,
    "SDVN UpscaleModel Download":UpscaleModelDownload,
    "SDVN VAE Download":VAEDownload,
    "SDVN ControlNet Download":ControlNetDownload,
    "SDVN UNET Download":UNETDownload,
    "SDVN CLIP Download":CLIPDownload,
    "SDVN StyleModel Download":StyleModelDownload,
    "SDVN Apply Kontext Reference": KontextReference,
    "SDVN IPAdapterModel Download": IPAdapterModelDownload,
    "SDVN InstantIDModel Download": InstantIDModelDownload,
    "SDVN AnyDownload List": AnyDownloadList,
    "SDVN DualCLIP Download": DualClipDownload,
    "SDVN QuadrupleCLIP Download": QuadrupleCLIPDownload,
}

# A dictionary that contains the friendly/humanly readable titles for the nodes
NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Load Checkpoint": "📀 Load Checkpoint",
    "SDVN Load Lora": "🎨 Load Lora",
    "SDVN Load Image": "🏞️ Load Image",
    "SDVN Load Image Folder": "🏞️ Load Image Folder",
    "SDVN Load Image Url": "📥 Load Image Url",
    "SDVN LoadPinterest": "📥 Load Pinterest",
    "SDVN Load Image Ultimate": "🏞️ Load Image Ultimate",
    "SDVN CLIP Text Encode": "🔡 CLIP Text Encode",
    "SDVN KSampler": "⌛️ KSampler",
    "SDVN Controlnet Apply": "🎚️ Controlnet Apply",
    "SDVN Inpaint": "👨‍🎨 Inpaint",
    "SDVN Apply Style Model": "🌈 Apply Style Model",
    "SDVN Apply Kontext Reference": "🌈 Apply Kontext Reference",
    "SDVN Styles":"🗂️ Prompt Styles",
    "SDVN Upscale Image": "↗️ Upscale Image",
    "SDVN UPscale Latent": "↗️ Upscale Latent",
    "SDVN Checkpoint Download": "📥 Checkpoint Download",
    "SDVN Checkpoint Download List": "📥 Checkpoint Download List",
    "SDVN Lora Download": "📥 Lora Download",
    "SDVN CLIPVision Download": "📥 CLIPVision Download",
    "SDVN UpscaleModel Download": "📥 UpscaleModel Download",
    "SDVN VAE Download": "📥 VAE Download",
    "SDVN ControlNet Download": "📥 ControlNet Download",
    "SDVN UNET Download": "📥 UNET Download",
    "SDVN CLIP Download": "📥 CLIP Download",
    "SDVN StyleModel Download": "📥  StyleModel Download",
    "SDVN IPAdapterModel Download": "📥  IPAdapterModel Download",
    "SDVN InstantIDModel Download": "📥  InstantIDModel Download",
    "SDVN AnyDownload List": "📥  AnyDownload List",
    "SDVN DualCLIP Download": "📥  DualCLIP Download",
    "SDVN QuadrupleCLIP Download": "📥  QuadrupleCLIP Download",
}
