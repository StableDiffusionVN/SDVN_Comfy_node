import os,ast
import folder_paths
from nodes import NODE_CLASS_MAPPINGS as ALL_NODE
import torch
from safetensors.torch import save_file, load_file

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
    DESCRIPTION = "Gộp hai mô hình theo MBW (Model Block Weights)."
    OUTPUT_TOOLTIPS = ("Mô hình đã gộp", "Thông số MBW đã dùng")

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
                if model_A is not None or model_B is not None or model_C is not None:
                    model_sub_BC = ALL_NODE["ModelMergeSubtract"]().merge(model_B,model_C,Multiplier_M)[0]
                    model_merge = ALL_NODE["ModelMergeAdd"]().merge(model_A, model_sub_BC)[0]
                    if MBW != None:
                        model_merge = ModelMergeBlocks().merge(model_merge, model_A, **ast.literal_eval(MBW))[0]
                else:
                    model_merge = None
                if clip_A is not None or clip_B is not None or clip_C is not None:
                    clip_sub_BC = ALL_NODE["CLIPMergeSubtract"]().merge(clip_B,clip_C,Multiplier_M)[0]
                    clip_merge = ALL_NODE["CLIPMergeAdd"]().merge(clip_A, clip_sub_BC)[0]
                else:
                    clip_merge = None
            if Save:
                if model_merge is not None and clip_merge is not None:
                    ALL_NODE["CheckpointSave"]().save(model_merge, clip_merge, vae, f"checkpoints/{Save_name}")
                elif model_merge is not None:
                    ALL_NODE["ModelSave"]().save(model_merge, f"diffusion_models/{Save_name}")
                elif clip_merge is not None:
                    ALL_NODE["CLIPSave"]().save(clip_merge,f"clip/{Save_name}")
                elif vae is not None:
                    ALL_NODE["VAESave"]().save(vae, f"vae/{Save_name}")
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
                ALL_NODE["LoraSave"]().execute(f"loras/{Save_name}", Lora_rank,"standard", True, model_sub_AB, clip_sub_AB)
            return {model_A, clip_A, vae}

class ModelExport:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "Option":(["Unet_to_fp8.pt","Lora_remove_clip","Checkpoint_to_model"],{}),
                "Input_path":("STRING", {"default": ""},),
                "Output_path":("STRING", {"default": ""},),
            },}

    OUTPUT_NODE = True
    RETURN_TYPES = ()
    FUNCTION = "export"   
    CATEGORY = "📂 SDVN/🧬 Merge"
    def export(s, Option, Input_path, Output_path):
        state = load_file(Input_path)
        if Option == "Unet_to_fp8.pt":
            state = s.unet_fp8(state)
        elif Option == "Lora_remove_clip":
            state = s.lora_model(state)
        elif Option == "Checkpoint_to_model":
            state = s.checkpoint_model(state)
        save_file(state, Output_path) if Option != "Unet_to_fp8.pt" else torch.save(state, Output_path)
        print(f"✅ Exported {Option} to {Output_path}")
        return {}
    def unet_fp8(s, state):
        fp8_dtype = torch.float8_e4m3fn
        for k, v in state.items():
            state[k] = v.to(device='cuda', dtype=fp8_dtype)
        return state
    def lora_model(s, state):
        diffusion_state_dict = {
            k:v for k, v in state.items() if k.startswith("lora_unet")
        }
        return diffusion_state_dict
    def checkpoint_model(s, state):
        diffusion_state_dict = {
            k.replace("model.diffusion_model.", ""): v
            for k, v in state.items() if k.startswith("model.diffusion_model.")
        }
        return diffusion_state_dict
     
NODE_CLASS_MAPPINGS = {
    "SDVN Merge SD1": ModelMergeSD1,
    "SDVN Merge SDXL": ModelMergeSDXL,
    "SDVN Merge Flux": ModelMergeFlux1,
    "SDVN Model Merge": ModelMerge,
    "SDVN Model Export": ModelExport,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Merge SD1": "🧬 Merge SD1",
    "SDVN Merge SDXL": "🧬 Merge SDXL",
    "SDVN Merge Flux": "🧬 Merge Flux",
    "SDVN Model Merge": "🧬 Model Merge",
    "SDVN Model Export": "🧬 Model Export",
}
