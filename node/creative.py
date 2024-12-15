from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
from googletrans import Translator, LANGUAGES

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


class Easy_IPA_weight:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "SDXL": ("BOOLEAN", {"default": False},),
            "Weight": ("STRING", {"default": "0:1,1:1,1,1,4-15:1", "multiline": False, }),
        }
        }

    CATEGORY = "📂 SDVN/💡 Creative"

    RETURN_TYPES = ("STRING",)
    OUTPUT_TOOLTIPS = (
        "Ex: 0-4:1,6:1,1,1 or 0-15:1 or 1,1,1,1,1 or 1:1,5:1,7:1",)
    FUNCTION = "convert_wright"

    def convert_wright(self, SDXL, Weight):
        max_block = 10 if SDXL else 15
        Weight = Weight.split(",")
        index = 0
        convert = []
        for i in range(len(Weight)):
            if ':' not in Weight[i]:
                convert += [f'{str(index)}:{Weight[i]}'] if index <= max_block else []
                index += 1
            elif '-' in Weight[i]:
                ran, num = Weight[i].split(':')
                min, max = ran.split('-')
                index = int(min)
                for j in range(int(min), int(max)+1):
                    convert += [f'{str(index)}:{num}'] if index <= max_block else []
                    index += 1
            else:
                convert += [Weight[i]] if index <= max_block else []
                index += 1
        final_weight = ",".join(convert)
        print(f'Block weight: [{final_weight}]')
        return (final_weight,)

class GGTranslate:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "text": ("STRING", {"default": "", "multiline": True, }),
            "translate": (lang_list(),),
        }}

    CATEGORY = "📂 SDVN/💡 Creative"
    RETURN_TYPES = ("STRING",)
    FUNCTION = "ggtranslate"

    def ggtranslate(self, text, translate):
        if translate == "None" or text == "":
            output = text
        else:
            output = Translator().translate(text, translate, 'auto').text 
            print(f'Translate: "{output}"')
        return (output,)
    
class AnyInput:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {
            "input": ("STRING", {"default": "","placeholder": "Ex: (in1+in2)/in3; in1 in2, in3; or every", "multiline": True, }),
            "translate": (lang_list(),),
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, "tooltip": "The random seed"}),
        },
                "optional": {
                    "in1":(any,),
                    "in2":(any,),
                    "in3":(any,),
                    "in4":(any,),
                }
        }

    CATEGORY = "📂 SDVN/💡 Creative"
    RETURN_TYPES = ("STRING", "FLOAT", "INT", "BOOLEAN")
    FUNCTION = "any_return"

    def any_return(self, input, translate, seed, in1 = None, in2 = None, in3 = None, in4 = None):
        in_list = {"in1":in1,"in2":in2,"in3":in3,"in4":in4}
        for i in in_list:
            if in_list[i] !=None and i in input:
                input = input.replace(i,str(in_list[i]))
        if "DPRandomGenerator" in ALL_NODE:
            cls = ALL_NODE["DPRandomGenerator"]
            input = cls().get_prompt(input, seed, 'No')[0]
        input = GGTranslate().ggtranslate(input,translate)[0]
        try:
            i = int(eval(input))
        except:
            i = 0
        try:
            f = float(eval(input))
        except:
            f = 0.0
        true_values = {"true",  "1", "yes", "y", "on"}
        false_values = {"false", "0", "no", "n", "off"}
        input = input.strip().lower()
        if input in true_values:
            b = True
        elif input in false_values:
            b = False
        else:
            b = False
        return (input, f, i, b,)


class ImageSize:

    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "image": ("IMAGE",),
                "latent": ("LATENT",),
                "maxsize": ("INT", {"default": 0, "min": 0, "max": 10240, "tooltip": "0 = noset"}),
            }}
    CATEGORY = "📂 SDVN/💡 Creative"
    RETURN_TYPES = ("INT", "INT",)
    RETURN_NAMES = ("width", "height",)
    FUNCTION = "imagesize"

    def imagesize(s, image=None, latent=None, maxsize = 0):
        if image != None:
            samples = image.movedim(-1, 1)
            w = samples.shape[3]
            h = samples.shape[2]
        elif latent != None:
            w = latent["samples"].shape[-1] * 8
            h = latent["samples"].shape[-2] * 8
        else:
            w = h = 0
        if maxsize > 0:
            if w > h:
                h = int(round(h * ( maxsize / w)))
                w = maxsize
            else:
                w = int(round(w * ( maxsize / h)))
                h = maxsize
        print(f"Image width: {w} | Image height: {h}")
        return (w, h,)


class Seed:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff, }),
            }}
    CATEGORY = "📂 SDVN/💡 Creative"
    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "seed"

    def seed(s, seed=0):
        return (seed,)


class Switch:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "true": (any,),
                "false": (any,),
                "target":  ("BOOLEAN", {"default": True},),
            }}
    CATEGORY = "📂 SDVN/💡 Creative"
    RETURN_TYPES = (any,)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch"

    def switch(s, true, false, target):
        if target == True:
            return (true,)
        else:
            return (false,)

class AnyShow:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "any": (any, {"forceInput": True}),
            },
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ()
    FUNCTION = "show"
    OUTPUT_NODE = True

    CATEGORY = "📂 SDVN/💡 Creative"

    def show(self, any):
        return {"ui": {"text": any}}

class Runtest:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "optional": {
                "any": (any, {"forceInput": True}),
            },
        }

    INPUT_IS_LIST = True
    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True

    CATEGORY = "📂 SDVN/💡 Creative"

    def run(self, any):
        return ()

NODE_CLASS_MAPPINGS = {
    "SDVN Easy IPAdapter weight": Easy_IPA_weight,
    "SDVN Any Input Type": AnyInput,
    "SDVN Image Size": ImageSize,
    "SDVN Seed": Seed,
    "SDVN Switch": Switch,
    "SDVN Translate": GGTranslate,
    "SDVN Any Show": AnyShow,
    "SDVN Run Test": Runtest,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Easy IPAdapter weight": "📊 IPAdapter weight",
    "SDVN Any Input Type": "🔡 Any Input Type",
    "SDVN Image Size": "📐 Image Size",
    "SDVN Seed": "🔢 Seed",
    "SDVN Switch": "🔄 Switch",
    "SDVN Translate": "🔃 Translate",
    "SDVN Any Show": "🔎 Any show",
    "SDVN Run Test": "⚡️ Run test"
}
