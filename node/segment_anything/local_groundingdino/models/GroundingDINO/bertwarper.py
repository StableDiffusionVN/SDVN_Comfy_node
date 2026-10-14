# ------------------------------------------------------------------------
# Grounding DINO
# url: https://github.com/IDEA-Research/GroundingDINO
# Copyright (c) 2023 IDEA. All Rights Reserved.
# Licensed under the Apache License, Version 2.0 [see LICENSE for details]
# ------------------------------------------------------------------------

import torch
from transformers import __version__ as transformers_version


def prepare_text_attention_mask(attention_mask, dtype):
    # BERT 4.x consumes a 3D keep mask; 5.x consumes a prepared 4D additive mask.
    if int(transformers_version.split(".", 1)[0]) < 5:
        return attention_mask
    return torch.zeros_like(attention_mask, dtype=dtype).masked_fill(
        ~attention_mask, torch.finfo(dtype).min
    ).unsqueeze(1)


def generate_masks_with_special_tokens_and_transfer_map(tokenized, special_tokens_list, tokenizer):
    """Generate attention mask between each pair of special tokens
    Args:
        input_ids (torch.Tensor): input ids. Shape: [bs, num_token]
        special_tokens_mask (list): special tokens mask.
    Returns:
        torch.Tensor: attention mask between each special tokens.
    """
    input_ids = tokenized["input_ids"]
    bs, num_token = input_ids.shape
    # special_tokens_mask: bs, num_token. 1 for special tokens. 0 for normal tokens
    special_tokens_mask = torch.zeros((bs, num_token), device=input_ids.device).bool()
    for special_token in special_tokens_list:
        special_tokens_mask |= input_ids == special_token

    # idxs: each row is a list of indices of special tokens
    idxs = torch.nonzero(special_tokens_mask)

    # generate attention mask and positional ids
    attention_mask = (
        torch.eye(num_token, device=input_ids.device).bool().unsqueeze(0).repeat(bs, 1, 1)
    )
    position_ids = torch.zeros((bs, num_token), device=input_ids.device)
    cate_to_token_mask_list = [[] for _ in range(bs)]
    previous_col = 0
    for i in range(idxs.shape[0]):
        row, col = idxs[i]
        if (col == 0) or (col == num_token - 1):
            attention_mask[row, col, col] = True
            position_ids[row, col] = 0
        else:
            attention_mask[row, previous_col + 1 : col + 1, previous_col + 1 : col + 1] = True
            position_ids[row, previous_col + 1 : col + 1] = torch.arange(
                0, col - previous_col, device=input_ids.device
            )
            c2t_maski = torch.zeros((num_token), device=input_ids.device).bool()
            c2t_maski[previous_col + 1 : col] = True
            cate_to_token_mask_list[row].append(c2t_maski)
        previous_col = col

    cate_to_token_mask_list = [
        torch.stack(cate_to_token_mask_listi, dim=0)
        for cate_to_token_mask_listi in cate_to_token_mask_list
    ]

    # # padding mask
    # padding_mask = tokenized['attention_mask']
    # attention_mask = attention_mask & padding_mask.unsqueeze(1).bool() & padding_mask.unsqueeze(2).bool()

    return attention_mask, position_ids.to(torch.long), cate_to_token_mask_list
