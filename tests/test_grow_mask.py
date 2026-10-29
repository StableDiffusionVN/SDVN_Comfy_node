import unittest
import numpy as np
import torch
from scipy import ndimage
from test_node_updates import load_symbols


class GrowMaskTests(unittest.TestCase):
    def setUp(self):
        cls = load_symbols('node/mask.py', ['GrowMask'], {
            'np': np, 'torch': torch, 'ndimage': ndimage,
        })['GrowMask']
        self.node = cls()
        self.mask = torch.zeros(2, 61, 61)
        self.mask[0, 10:51, 20:41] = 1
        self.mask[1, 15:46, 15:46] = 0.7

    def test_all_matches_original_for_both_signs_and_corners(self):
        for expand in (-5, 0, 5):
            for tapered in (False, True):
                c = int(not tapered)
                kernel = [[c, 1, c], [1, 1, 1], [c, 1, c]]
                op = ndimage.grey_dilation if expand > 0 else ndimage.grey_erosion
                expected = self.mask.numpy().copy()
                for item in expected:
                    for _ in range(abs(expand)):
                        item[:] = op(item, footprint=kernel)
                result = self.node.grow_mask(self.mask, expand, 'all', tapered_corners=tapered)[0]
                np.testing.assert_array_equal(result.numpy(), expected)

    def test_bottom_keeps_top_and_changes_bottom_for_both_signs(self):
        for expand in (-8, 8):
            result = self.node.grow_mask(self.mask, expand, 'bottom')[0]
            self.assertTrue(torch.equal(result[0, :11], self.mask[0, :11]))
            self.assertFalse(torch.equal(result[0, 43:], self.mask[0, 43:]))
            self.assertTrue(torch.all(result >= self.mask) if expand > 0 else torch.all(result <= self.mask))
            self.assertEqual(result.dtype, self.mask.dtype)
            self.assertEqual(result.shape, self.mask.shape)

    def test_direction_rotation_and_custom_angle(self):
        bottom = self.node.grow_mask(self.mask, 8, 'bottom')[0]
        top = self.node.grow_mask(self.mask.flip(1), 8, 'top')[0].flip(1)
        torch.testing.assert_close(bottom, top)
        custom = self.node.grow_mask(self.mask, 8, 'custom', 90)[0]
        torch.testing.assert_close(bottom, custom)
        for direction in self.node.INPUT_TYPES()['required']['direction'][0]:
            result = self.node.grow_mask(self.mask, -4, direction)[0]
            self.assertTrue(torch.isfinite(result).all())

    def test_empty_and_zero_and_no_input_mutation(self):
        original = self.mask.clone()
        torch.testing.assert_close(self.node.grow_mask(self.mask, 0, 'bottom')[0], original)
        self.node.grow_mask(self.mask, -10, 'bottom')
        torch.testing.assert_close(self.mask, original)
        empty = torch.zeros_like(self.mask)
        torch.testing.assert_close(self.node.grow_mask(empty, 8, 'bottom')[0], empty)


if __name__ == '__main__':
    unittest.main()
