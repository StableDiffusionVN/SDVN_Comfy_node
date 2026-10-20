import os
import re

import folder_paths
from nodes import NODE_CLASS_MAPPINGS
from torch.hub import download_url_to_file


SAM31_FILENAME = 'sam3.1_multiplex_fp16.safetensors'
SAM31_URL = f'https://huggingface.co/Comfy-Org/sam3.1/resolve/main/checkpoints/{SAM31_FILENAME}'


def load_sam31():
    if 'SAM3_Detect' not in NODE_CLASS_MAPPINGS:
        raise RuntimeError('SAM 3.1 cần ComfyUI có node SAM3 Detect native. Cập nhật ComfyUI rồi khởi động lại.')
    from comfy import sd, supported_models

    if not hasattr(supported_models, 'SAM31'):
        raise RuntimeError('Bản ComfyUI này chưa hỗ trợ SAM 3.1. Cập nhật ComfyUI rồi khởi động lại.')
    checkpoint = folder_paths.get_full_path('sam3', SAM31_FILENAME)
    if checkpoint is None:
        local_dir = os.path.join(folder_paths.models_dir, 'sam3')
        checkpoint = os.path.join(local_dir, SAM31_FILENAME)
        if not os.path.isfile(checkpoint):
            os.makedirs(local_dir, exist_ok=True)
            download_url_to_file(SAM31_URL, checkpoint)
    model, clip, _, _ = sd.load_checkpoint_guess_config(checkpoint, output_vae=False)
    if clip is None:
        raise RuntimeError(f'{SAM31_FILENAME} thiếu text encoder. Hãy dùng checkpoint đầy đủ từ Comfy-Org/sam3.1.')
    return {'model': model, 'clip': clip}


def sam31_segment(sam_model, image, prompt, threshold):
    clip = sam_model['clip']
    # SAM3's native tokenizer supports comma-separated concepts and :N limits.
    # The SDVN node selects all matching objects by default, as GroundingDINO does.
    concepts = [part.strip() for part in prompt.split(',') if part.strip()]
    text = ', '.join(part if re.search(r':\s*[\d.]+\s*$', part) else f'{part}:200'
                     for part in concepts)
    conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(text))
    result = NODE_CLASS_MAPPINGS['SAM3_Detect'].execute(
        model=sam_model['model'], image=image, conditioning=conditioning,
        threshold=threshold, individual_masks=False,
    )
    masks = result[0].cpu().float()
    return (image.cpu()[..., :3] * masks.unsqueeze(-1), masks)
