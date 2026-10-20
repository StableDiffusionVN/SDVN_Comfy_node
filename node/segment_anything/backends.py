import os
import re

import folder_paths
from nodes import NODE_CLASS_MAPPINGS


def load_sam3(repo_id, filename):
    if 'SAM3_Detect' not in NODE_CLASS_MAPPINGS:
        raise RuntimeError('SAM 3/3.1 cần ComfyUI có node SAM3 Detect native. Cập nhật ComfyUI rồi khởi động lại.')
    from comfy import sd, supported_models

    if repo_id == 'facebook/sam3.1' and not hasattr(supported_models, 'SAM31'):
        raise RuntimeError('Bản ComfyUI này chưa hỗ trợ SAM 3.1. Cập nhật ComfyUI hoặc chọn SAM 3.')
    checkpoint = folder_paths.get_full_path('sams', filename)
    if checkpoint is None:
        local_dir = os.path.join(folder_paths.models_dir, 'sams')
        checkpoint = os.path.join(local_dir, filename)
        if not os.path.isfile(checkpoint):
            from huggingface_hub import hf_hub_download
            from huggingface_hub.errors import GatedRepoError

            try:
                checkpoint = hf_hub_download(repo_id=repo_id, filename=filename, local_dir=local_dir)
            except GatedRepoError as error:
                raise RuntimeError(
                    f'Cần chấp nhận quyền truy cập tại https://huggingface.co/{repo_id} '
                    f'và đăng nhập Hugging Face trong môi trường ComfyUI, '
                    f'hoặc đặt {filename} vào models/sams.'
                ) from error
    model, clip, _, _ = sd.load_checkpoint_guess_config(checkpoint, output_vae=False)
    if clip is None:
        raise RuntimeError(f'{filename} thiếu text encoder. Hãy dùng checkpoint đầy đủ từ {repo_id}.')
    return {'backend': 'sam3', 'model': model, 'clip': clip}


def sam3_segment(sam_model, image, prompt, threshold):
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
