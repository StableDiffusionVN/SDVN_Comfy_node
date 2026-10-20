import json
import os
import re

import numpy as np
import torch
from PIL import Image
from huggingface_hub import snapshot_download
from safetensors.torch import load_file
from transformers import (
    AddedToken, AttentionInterface, BartTokenizerFast, CLIPImageProcessor, Florence2Config,
    Florence2ForConditionalGeneration, Florence2Processor, Florence2VisionConfig,
    GenerationConfig,
)
from transformers.masking_utils import AttentionMaskInterface, eager_mask

import folder_paths
import comfy.model_management as mm
from comfy.ldm.modules.attention import optimized_attention_for_device
from comfy.model_patcher import ModelPatcher
from comfy.utils import ProgressBar


PROMPTGEN_MODELS = {
    'base': 'MiaoshouAI/Florence-2-base-PromptGen-v2.0',
    'large': 'MiaoshouAI/Florence-2-large-PromptGen-v2.0',
}
PROMPTGEN_TASKS = {
    'Detailed prompt': '<MORE_DETAILED_CAPTION>',
    'Short caption': '<CAPTION>',
    'Tags': '<GENERATE_TAGS>',
    'Caption + tags': '<MIXED_CAPTION>',
    'Composition': '<ANALYZE>',
    'Caption + tags + composition': '<MIXED_CAPTION_PLUS>',
    'OCR': '<OCR>',
}
PROMPTGEN_FILES = [
    'config.json', 'generation_config.json', 'preprocessor_config.json',
    'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json',
    'added_tokens.json', 'vocab.json', 'merges.txt', 'model.safetensors',
]


def promptgen_attention(module, query, key, value, attention_mask, scaling=None, **kwargs):
    if scaling is not None:
        query = query * (scaling * query.shape[-1] ** 0.5)
    attention = optimized_attention_for_device(
        query.device, mask=attention_mask is not None, small_input=query.shape[-1] > 256)
    result = attention(query, key, value, query.shape[1], mask=attention_mask, skip_reshape=True)
    return result.reshape(query.shape[0], query.shape[2], query.shape[1], value.shape[-1]), None


AttentionInterface.register('sdvn_promptgen', promptgen_attention)
AttentionMaskInterface.register('sdvn_promptgen', eager_mask)


class PromptGenModel(torch.nn.Module):
    def __init__(self, transformer):
        super().__init__()
        self.transformer = transformer

    def get_dtype(self):
        return self.transformer.dtype


def promptgen_weights(state, dtype):
    # Original PromptGen checkpoints predate the native Transformers Florence2 layout.
    converted = {}
    for key, value in state.items():
        if key == 'language_model.final_logits_bias':
            if torch.count_nonzero(value):
                raise ValueError('PromptGen checkpoint có logits bias không được hỗ trợ.')
            continue
        if key == 'image_projection':
            key = 'model.multi_modal_projector.image_projection.weight'
            value = value.T
        elif key.startswith('language_model.model.'):
            key = key.replace('language_model.model.', 'model.language_model.', 1)
        elif key == 'language_model.lm_head.weight':
            key = 'lm_head.weight'
        elif key.startswith('vision_tower.'):
            key = 'model.' + key
            key = re.sub(r'(convs\.\d+)\.proj\.', r'\1.conv.', key)
            key = key.replace('.conv1.fn.dw.', '.conv1.').replace('.conv2.fn.dw.', '.conv2.')
            key = key.replace('.window_attn.norm.', '.norm1.').replace('.channel_attn.norm.', '.norm1.')
            key = key.replace('.window_attn.fn.', '.window_attn.').replace('.channel_attn.fn.', '.channel_attn.')
            key = key.replace('.ffn.norm.', '.norm2.').replace('.ffn.fn.net.', '.ffn.')
        else:
            key = 'model.multi_modal_projector.' + key.replace('image_pos_embed.', 'image_position_embed.')
        converted[key] = value.to(dtype=dtype)
    shared = converted['model.language_model.shared.weight']
    converted['model.language_model.encoder.embed_tokens.weight'] = shared
    converted['model.language_model.decoder.embed_tokens.weight'] = shared
    return converted


def load_promptgen(model_name):
    repo = PROMPTGEN_MODELS[model_name]
    directory = os.path.join(folder_paths.models_dir, 'LLM', repo.split('/')[-1])
    if any(not os.path.isfile(os.path.join(directory, name)) for name in PROMPTGEN_FILES):
        snapshot_download(repo_id=repo, local_dir=directory, allow_patterns=PROMPTGEN_FILES, token=False)
    with open(os.path.join(directory, 'config.json'), encoding='utf-8') as file:
        original = json.load(file)
    vision = original['vision_config'].copy()
    vision['embed_dim'] = vision.pop('dim_embed')
    vision['max_temporal_embeddings'] = vision.pop('visual_temporal_embedding')['max_temporal_embeddings']
    vision['max_position_embeddings'] = vision.pop('image_pos_embed')['max_pos_embeddings']
    vision['drop_path_rate'] = 0.0
    text = original['text_config'].copy()
    text.update(model_type='bart', dropout=0.0, attention_dropout=0.0, activation_dropout=0.0)
    tokenizer = BartTokenizerFast.from_pretrained(directory, local_files_only=True)
    tokenizer.add_tokens(AddedToken('<image>', special=True, normalized=False), special_tokens=True)
    tokenizer.image_token = '<image>'
    tokenizer.image_token_id = tokenizer.convert_tokens_to_ids('<image>')
    image_processor = CLIPImageProcessor.from_pretrained(directory, local_files_only=True)
    image_processor.image_seq_length = 577
    processor = Florence2Processor(image_processor=image_processor, tokenizer=tokenizer)
    config = Florence2Config(text_config=text, vision_config=Florence2VisionConfig(**vision),
                            image_token_id=tokenizer.image_token_id, attn_implementation='sdvn_promptgen')
    device = mm.get_torch_device()
    offload_device = mm.unet_offload_device()
    dtype = torch.float16 if mm.should_use_fp16(device) else torch.float32
    with torch.device('meta'):
        model = Florence2ForConditionalGeneration(config)
    state = promptgen_weights(load_file(os.path.join(directory, 'model.safetensors')), dtype)
    model.load_state_dict(state, strict=True, assign=True)
    model.tie_weights()
    model.resize_token_embeddings(len(tokenizer), mean_resizing=False)
    model.generation_config = GenerationConfig.from_pretrained(directory, local_files_only=True)
    model.eval().to(offload_device)
    return ModelPatcher(PromptGenModel(model), load_device=device, offload_device=offload_device), processor


class FlorencePromptGen:
    def __init__(self):
        self.patcher = None
        self.processor = None
        self.model_name = None

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'image': ('IMAGE',),
            'model': (list(PROMPTGEN_MODELS), {'default': 'base', 'tooltip': 'Base nhẹ và nhanh; Large dùng nhiều bộ nhớ hơn.'}),
            'mode': (list(PROMPTGEN_TASKS), {'default': 'Detailed prompt', 'tooltip': 'Mô tả ảnh thành prompt tiếng Anh. OCR chỉ chép chữ có trong ảnh.'}),
            'max_new_tokens': ('INT', {'default': 256, 'min': 16, 'max': 1024, 'step': 16}),
            'num_beams': ('INT', {'default': 1, 'min': 1, 'max': 5, 'tooltip': '1 nhanh nhất; 3 tìm câu mô tả kỹ hơn nhưng chậm hơn.'}),
            'keep_model_loaded': ('BOOLEAN', {'default': False, 'tooltip': 'Giữ model trên thiết bị để chạy liên tiếp nhanh hơn; ComfyUI vẫn có thể giải phóng khi cần.'}),
        }}

    CATEGORY = '📂 SDVN/🏞️ Image'
    RETURN_TYPES = ('STRING',)
    RETURN_NAMES = ('prompt',)
    OUTPUT_IS_LIST = (True,)
    FUNCTION = 'caption'
    DESCRIPTION = 'Ảnh → prompt tiếng Anh bằng Florence-2 PromptGen v2.0. Tự tải model vào models/LLM khi chạy lần đầu; không cần API key.'

    def caption(self, image, model, mode, max_new_tokens, num_beams, keep_model_loaded):
        if model not in PROMPTGEN_MODELS:
            raise ValueError('Model PromptGen không hợp lệ.')
        task = PROMPTGEN_TASKS[mode]
        if self.model_name != model:
            if self.patcher is not None:
                mm.unload_model_and_clones(self.patcher)
            self.patcher = self.processor = None
            self.model_name = None
            self.patcher, self.processor = load_promptgen(model)
            self.model_name = model
        prompts = []
        progress = ProgressBar(image.shape[0])
        try:
            mm.load_models_gpu([self.patcher], force_full_load=True)
            transformer = self.patcher.model.transformer
            for frame in image:
                mm.throw_exception_if_processing_interrupted()
                rgb = (frame[..., :3].detach().cpu().float().clamp(0, 1).numpy() * 255).astype(np.uint8)
                inputs = self.processor(text=task, images=Image.fromarray(rgb), return_tensors='pt')
                inputs = inputs.to(self.patcher.load_device, transformer.dtype)
                generated = transformer.generate(
                    **inputs, max_new_tokens=max_new_tokens, num_beams=num_beams,
                    early_stopping=num_beams > 1, do_sample=False)
                prompts.append(self.processor.batch_decode(
                    generated, skip_special_tokens=True, clean_up_tokenization_spaces=False)[0].strip())
                progress.update(1)
        finally:
            if not keep_model_loaded:
                mm.unload_model_and_clones(self.patcher)
        return (prompts,)


NODE_CLASS_MAPPINGS = {'SDVN Florence PromptGen': FlorencePromptGen}
NODE_DISPLAY_NAME_MAPPINGS = {'SDVN Florence PromptGen': '📝 Florence PromptGen'}
