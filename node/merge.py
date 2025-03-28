import os,ast
import folder_paths
from nodes import NODE_CLASS_MAPPINGS as ALL_NODE

def none2list(folderlist):
    list = ["None"]
    list += folderlist
    return list

class ModelMergeBlocks:
    @classmethod
    def INPUT_TYPES(s):
        return {"required": {"model1": ("MODEL",),
                             "model2": ("MODEL",),
                             "input": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                             "middle": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                             "output": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01})
                             }}
    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("model", "mbw",)
    FUNCTION = "merge"

    CATEGORY = "📂 SDVN/🧬 Merge"

    def merge(self, model1=None, model2=None, **kwargs):
        if len(kwargs) > 3:
            print(True)
            hargs = kwargs
        else:
            for i in kwargs:
                kwargs[i] = kwargs[i].split(',')
            hargs = {}
            for i in kwargs:
                index = 0
                for j in range(len(kwargs[i])):
                    if '-' in kwargs[i][j]:
                        ran, num = kwargs[i][j].split(':')
                        min, max = ran.split('-')
                        num = float(num)
                        index = int(min)
                        for a in range(int(min), int(max)+1):
                            hargs[f'{i}.{index}'] = num
                            index += 1
                    elif ':' in kwargs[i][j]:
                        index, num = kwargs[i][j].split(':')
                        index = int(index)
                        hargs[f'{i}.{index}'] = float(num)
                        index += 1
                    else:
                        kwargs[i][j] = float(kwargs[i][j])
                        hargs[f'{i}.{index}'] = kwargs[i][j]
                        index += 1
                hargs[i] = num if '-' in str(kwargs[i][0]) else kwargs[i][j]
        print(f'Final blocks:\n{hargs}')
        if model1 != None and model2 != None:
            m = model1.clone()
            kp = model2.get_key_patches("diffusion_model.")
            default_ratio = next(iter(hargs.values()))
            for k in kp:
                ratio = default_ratio
                k_unet = k[len("diffusion_model."):]

                last_arg_size = 0
                for arg in hargs:
                    if k_unet.startswith(arg) and last_arg_size < len(arg):
                        ratio = hargs[arg]
                        last_arg_size = len(arg)

                m.add_patches({k: kp[k]}, 1.0 - ratio, ratio)
            return (m, str(hargs))
        return (None, str(hargs))


class ModelMergeSD1(ModelMergeBlocks):
    CATEGORY = "📂 SDVN/🧬 Merge"

    @classmethod
    def INPUT_TYPES(s):

        return {
            "required": {
                "input_blocks": ("STRING", {"default": "0-6:1,7-11:1"},),
                "middle_block": ("STRING", {"default": "1"},),
                "output_blocks": ("STRING", {"default": "1,1,1,1,1,1,1,1,1,1,1,1"},)
            },
            "optional": {
                "model1": ("MODEL",),
                "model2": ("MODEL",),
            }
        }


class ModelMergeSDXL(ModelMergeBlocks):
    CATEGORY = "📂 SDVN/🧬 Merge"

    @classmethod
    def INPUT_TYPES(s):

        return {
            "required": {
                "input_blocks": ("STRING", {"default": "0-4:1,5-8:1"},),
                "middle_block": ("STRING", {"default": "1"},),
                "output_blocks": ("STRING", {"default": "1,1,1,1,1,1,1,1,1"},)
            },
            "optional": {
                "model1": ("MODEL",),
                "model2": ("MODEL",),
            }
        }


class ModelMergeFlux1(ModelMergeBlocks):
    CATEGORY = "📂 SDVN/🧬 Merge"

    @classmethod
    def INPUT_TYPES(s):

        return {
            "required": {
                "double_blocks": ("STRING", {"default": "0-9:1,10-18:1"},),
                "single_blocks": ("STRING", {"default": "0-37:1"},),
            },
            "optional": {
                "model1": ("MODEL",),
                "model2": ("MODEL",),
            }
        }

class ModelMergeFlux1(ModelMergeBlocks):
    CATEGORY = "📂 SDVN/🧬 Merge"

    @classmethod
    def INPUT_TYPES(s):

        return {
            "required": {
                "double_blocks": ("STRING", {"default": "0-9:1,10-18:1"},),
                "single_blocks": ("STRING", {"default": "0-37:1"},),
            },
            "optional": {
                "model1": ("MODEL",),
                "model2": ("MODEL",),
            }
        }

class ModelMerge:
    @classmethod
    def INPUT_TYPES(s):

        return {
            "required": {
                "Option":(["Merge Simple [ A ]", "Merge Sum [ A * (1 - M) + B * M ]", "Merge Difference [ A + (B - C) * M ]", "Lora Export [ A - B]"],{}),
                "Checkpoint_A": (none2list(folder_paths.get_filename_list("checkpoints")), {"default": "None"}),
                "Checkpoint_B": (none2list(folder_paths.get_filename_list("checkpoints")), {"default": "None"}),
                "Checkpoint_C": (none2list(folder_paths.get_filename_list("checkpoints")), {"default": "None"}),
                "Multiplier_M": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "Save": ("BOOLEAN", {"default": True},),
                "Save_name": ("STRING", {"default": "model_merge"},),
                "Lora_rank": ("INT", {"default": 64, "min": 1, "max": 4096, "step": 1}),
            },
            "optional": {
                "model_A": ("MODEL",),
                "model_B": ("MODEL",),
                "model_C": ("MODEL",),
                "clip_A": ("CLIP",),
                "clip_B": ("CLIP",),
                "clip_C": ("CLIP",),
                "vae": ("VAE",),
                "MBW": ("STRING", {"forceInput": True}),
            }
        }
    OUTPUT_NODE = True
    RETURN_TYPES = ("MODEL","CLIP","VAE")
    FUNCTION = "modelmerge"   
    CATEGORY = "📂 SDVN/🧬 Merge"

    def modelmerge(s, Option, Checkpoint_A, Checkpoint_B, Checkpoint_C, Multiplier_M, Save, Save_name, Lora_rank, model_A = None, model_B = None, model_C = None, clip_A = None, clip_B = None, clip_C = None, vae = None, MBW = None):
        if model_A == None and clip_A == None and Checkpoint_A != "None":
            model_A, clip_A, vae = ALL_NODE["CheckpointLoaderSimple"]().load_checkpoint(Checkpoint_A)[:3]
        if model_B == None and clip_B == None and Checkpoint_B != "None":
            model_B, clip_B = ALL_NODE["CheckpointLoaderSimple"]().load_checkpoint(Checkpoint_B)[:2]
        if model_C == None and clip_C == None and Checkpoint_C != "None":
            model_C, clip_C = ALL_NODE["CheckpointLoaderSimple"]().load_checkpoint(Checkpoint_C)[:2]
        if Option != "Lora Export [ A - B]":
            if Option == "Merge Simple [ A ]":
                model_merge,  clip_merge = model_A, clip_A
            else:
                if Option == "Merge Sum [ A * (1 - M) + B * M ]":
                    model_C, clip_C = model_A, clip_A
                model_sub_BC = ALL_NODE["ModelMergeSubtract"]().merge(model_B,model_C,Multiplier_M)[0]
                clip_sub_BC = ALL_NODE["CLIPMergeSubtract"]().merge(clip_B,clip_C,Multiplier_M)[0]
                model_merge = ALL_NODE["ModelMergeAdd"]().merge(model_A, model_sub_BC)[0]
                if MBW != None:
                    model_merge = ModelMergeBlocks().merge(model_merge, model_A, **ast.literal_eval(MBW))[0]
                clip_merge = ALL_NODE["CLIPMergeAdd"]().merge(clip_A, clip_sub_BC)[0]
            if Save:
                ALL_NODE["CheckpointSave"]().save(model_merge, clip_merge, vae, f"checkpoints/{Save_name}")
            return (model_merge, clip_merge, vae)
        else:
            if model_A != None and model_B != None:
                if MBW != None:
                    model_A = ModelMergeBlocks().merge(model_A, model_B, **ast.literal_eval(MBW))[0]
                model_sub_AB = ALL_NODE["ModelMergeSubtract"]().merge(model_A, model_B, Multiplier_M)[0]
            else:
                model_sub_AB = None
            if clip_A != None and clip_B != None:
                clip_sub_AB = ALL_NODE["CLIPMergeSubtract"]().merge(clip_A, clip_B, Multiplier_M)[0]
            else:
                clip_sub_AB = None
            if Save:
                ALL_NODE["LoraSave"]().save(f"loras/{Save_name}", Lora_rank,"standard", True, model_sub_AB, clip_sub_AB)
            return {model_A, clip_A, vae}

NODE_CLASS_MAPPINGS = {
    "SDVN Merge SD1": ModelMergeSD1,
    "SDVN Merge SDXL": ModelMergeSDXL,
    "SDVN Merge Flux": ModelMergeFlux1,
    "SDVN Model Merge": ModelMerge,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Merge SD1": "🧬 Merge SD1",
    "SDVN Merge SDXL": "🧬 Merge SDXL",
    "SDVN Merge Flux": "🧬 Merge Flux",
     "SDVN Model Merge": "🧬 Model Merge",
}
