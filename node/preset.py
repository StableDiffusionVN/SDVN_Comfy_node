from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
import folder_paths
import comfy.samplers
import random, json, os

class AnyType(str):
    """A special class that is always equal in not equal comparisons. Credit to pythongosssss"""

    def __eq__(self, _) -> bool:
        return True

    def __ne__(self, __value: object) -> bool:
        return False


any = AnyType("*")

def check_type_model(m):
    type_name = m.model.__class__.__name__
    type_name = "SD 1.5" if type_name == "BaseModel" else type_name
    return type_name

def none2list(folderlist):
    list = ["None"]
    list += folderlist
    return list
    
class join_parameter:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "any1": ("PARAMETER",),
                "any2": ("PARAMETER",),
                "any3": ("PARAMETER",),
                "any4": ("PARAMETER",),
                "any5": ("PARAMETER",),
                "any6": ("PARAMETER",),
                "any7": ("PARAMETER",),
                "any8": ("PARAMETER",),
                "any9": ("PARAMETER",),
                "any10": ("PARAMETER",),
            }
        }

    CATEGORY = "📂 SDVN/✨ Preset"
    RETURN_TYPES = ("PARAMETER",)
    RETURN_NAMES = ("parameter",)
    FUNCTION = "join_parameter"

    def join_parameter(s, **kargs):
        r = []
        for i in kargs:
            if kargs[i] is not None:
                if isinstance(kargs[i], list):
                    r += [*kargs[i]]
                else:
                    r += [kargs[i]]
        return (r,)
class auto_generate:
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
        return {
            "required": {
                "model":("MODEL",),
                "clip":("CLIP",),
                "vae":("VAE",),
                "Prompt": ("STRING", {"default": "", "multiline": True},),
                "Negative": ("STRING", {"default": "", "multiline": True, "placeholder": "No support Flux model"},),
                "Active_prompt": ("STRING", {"default": "", "multiline": False},),
                "Image_size": ("STRING", {"default": "1024,1024", "multiline": False},),
                "Steps": ("INT", {"default": 20, "min": 0, "max": 100, "step": 1},),
                "Denoise": ("FLOAT", {"default": 1, "min": 0, "max": 1, "step": 0.01}),
                "Inpaint_model": ("BOOLEAN", {"default": False},),
                "Random_prompt": ("BOOLEAN", {"default": False},),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
                "AdvSetting": ("BOOLEAN", {"default": False},),
                "cfg": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 100.0, "step": 0.1, "round": 0.01, "tooltip": "The Classifier-Free Guidance scale balances creativity and adherence to the prompt. Higher values result in images more closely matching the prompt however too high values will negatively impact quality."}),
                "sampler_name": (comfy.samplers.KSampler.SAMPLERS, {"tooltip": "The algorithm used when sampling, this can affect the quality, speed, and style of the generated output."}),
                "scheduler": (comfy.samplers.KSampler.SCHEDULERS, {"tooltip": "The scheduler controls how noise is gradually removed to form the image."}),
                "FluxGuidance":  ("FLOAT", {"default": 3.5, "min": 0.0, "max": 100.0, "step": 0.1}),
                "Upscale_model": (none2list(s.list_full_upscale_model), {"default": "None", }),
                "Auto_hires": ("BOOLEAN", {"default": False},),
                "Kontext_model": ("BOOLEAN", {"default": False},),
            },
            "optional": {
                "image": ("IMAGE",),
                "mask": ("MASK",),
                "parameter": ("PARAMETER",)
            }
            }
    CATEGORY = "📂 SDVN/✨ Preset"
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "auto_generate"
    model_para = {
        "Flux": [1152, "None", 0.3, 1536],
        "Z-Image": [1152, "None", 0.3, 1536],
        "QwenImage": [1152, "None", 0.3, 1536],
        "SDXL": [1024, "XL-BasePrompt", 0.3, 1536],
        "SDXL Lightning": [1024, "XL-BasePrompt", 0.3, 1536],
        "SDXL Hyper": [1024, "XL-BasePrompt", 0.3, 1536],
        "SD 1.5": [768, "1.5-BasePrompt", 0.4, 1920],
        "None": [768, "1.5-BasePrompt", 0.4, 1920],
    }
    def auto_generate(s, model, clip, vae, Prompt, Negative, Active_prompt, Image_size, Steps, Denoise, Inpaint_model, Random_prompt, AdvSetting, cfg, sampler_name, scheduler, FluxGuidance, Upscale_model, seed, Auto_hires = False, Kontext_model = False, image = None, mask = None, parameter = None):
        if AdvSetting == False:
            Auto_hires = True 
        type_model = check_type_model(model)
        type_model = "None" if type_model not in s.model_para else type_model
        print(f"Type model : {type_model}")
        if type_model == "SDXL" and Steps == 8:
            type_model = "SDXL Lightning"
        size = ALL_NODE["SDVN Simple Any Input"]().simple_any(Image_size)[0]
        if len(size) == 1:
            w = h = size[0]
        else:
            w, h = size[:2]

        if image is not None:
            samples = image.movedim(-1, 1)
            i_w = samples.shape[3]
            i_h = samples.shape[2]
            if w/h > i_w/i_h:
                w = int(round(i_w * h / i_h))
            else:
                h = int(round(w * i_h / i_w))

        Denoise = 1 if image is None else Denoise
        if Auto_hires:
            max_size = s.model_para[type_model][0] / Denoise
            if w > h:
                n_w = max_size if max_size < w else w
                n_h = h * (max_size/w) if max_size < w else h
            else:
                n_h = max_size if max_size < h else h
                n_w = w * (max_size/h) if max_size < h else w
        else:
            n_w = w
            n_h = h
        n_h = int(round(n_h))
        n_w = int(round(n_w))
        rand_seed = random.randint(0, 0xffffffffffffffff)
        Prompt = ALL_NODE["SDVN Random Prompt"]().get_prompt(Prompt, 1, seed)[0][0]
        Negative = ALL_NODE["SDVN Random Prompt"]().get_prompt(Negative, 1, seed)[0][0]
        Prompt = ALL_NODE["SDVN Translate"]().ggtranslate(Prompt,"en")[0]
        Prompt = f"{Active_prompt}, {Prompt}"
        Negative = ALL_NODE["SDVN Translate"]().ggtranslate(Negative,"en")[0]
        p, n, _ = ALL_NODE["SDVN CLIP Text Encode"]().encode(clip, Prompt, Negative, s.model_para[type_model][1], "None", rand_seed if Random_prompt else seed)
        if image is None:
            latent = ALL_NODE["EmptyLatentImage"]().generate(n_w, n_h, 1)[0]
        else:
            image = ALL_NODE["SDVN Upscale Image"]().upscale("Resize", n_w, n_h, 1, "None", image)[0]
            if Kontext_model == False:
                p, n, latent = ALL_NODE["SDVN Inpaint"]().encode(False if Inpaint_model else True, image, vae, mask, p, n)
            else:
                p, _, __, latent = ALL_NODE["SDVN Apply Kontext Reference"]().append(0, p, vae, image=image, mask=mask)
        if parameter is not None:
            if not isinstance(parameter, list):
                parameter = [parameter]
            for para in parameter:
                if "controlnet" in para:
                    p, n = ALL_NODE["SDVN Controlnet Apply"]().apply_controlnet(*para["controlnet"], vae=vae, positive = p, negative = n)["result"][:2]
                if "applystyle" in para:
                    p = ALL_NODE["SDVN Apply Style Model"]().applystyle(*para["applystyle"], p)[0]

        tile_size = s.model_para[type_model][3]
        if AdvSetting:
            type_model = "None"

        _, img = ALL_NODE["SDVN KSampler"]().sample(
            model,
            p,
            type_model,
            "Denoise",
            sampler_name,
            scheduler,
            seed,
            Tiled=True if (n_w > tile_size or n_h > tile_size) and Denoise < 0.5 else False,
            tile_width=int(round(n_w/2)),
            tile_height=int(round(n_h/2)),
            steps=Steps,
            cfg=cfg,
            denoise=Denoise,
            negative=n,
            latent_image=latent,
            vae=vae,
            FluxGuidance=35 if Inpaint_model and type_model == "Flux" and not AdvSetting else FluxGuidance,
        )
        if w == n_w:
            return (img,)
        else:
            try:
                upscale_model = Upscale_model if AdvSetting else folder_paths.get_filename_list("upscale_models")[-1] 
            except:
                upscale_model = "None"
            print(f"Upscale by {upscale_model}")
            img = ALL_NODE["SDVN Upscale Image"]().upscale("Resize", w, h, 1, upscale_model, img)[0]
            latent = ALL_NODE["SDVN Inpaint"]().encode(True, img, vae, mask, None, None)[2]
            img = ALL_NODE["SDVN KSampler"]().sample(
                model,
                p,
                type_model,
                "Denoise",
                sampler_name,
                scheduler,
                seed,
                Tiled=True if (n_w > tile_size or n_h > tile_size) else False,
                tile_width=int(round(w/2)),
                tile_height=int(round(h/2)),
                steps=Steps,
                cfg=cfg,
                denoise=s.model_para[type_model][2],
                negative=n,
                latent_image=latent,
                vae=vae,
                FluxGuidance=35 if Inpaint_model and type_model == "Flux" and not AdvSetting else FluxGuidance,
            )[1]
            return (img,)
        
                
NODE_CLASS_MAPPINGS = {
    "SDVN Auto Generate": auto_generate,
    "SDVN Join Parameter": join_parameter,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Auto Generate": "💡 Auto Generate",
    "SDVN Join Parameter": "🔄 Join Parameter",
}