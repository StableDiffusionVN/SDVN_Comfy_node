import subprocess
import sys, os
from importlib.metadata import PackageNotFoundError, version
from importlib import invalidate_caches

# This bootstrap must run before importing any node or third-party helper.
try:
    from packaging.requirements import Requirement
except ImportError:
    print("SDVN: Installing packaging into ComfyUI's Python...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "packaging"])
    invalidate_caches()
    from packaging.requirements import Requirement

def check_pip(package_name):
    requirement = Requirement(package_name)
    if requirement.marker is not None and not requirement.marker.evaluate():
        return True
    try:
        installed_version = version(requirement.name)
    except PackageNotFoundError:
        return False
    return requirement.specifier.contains(installed_version, prereleases=True)


def install():
    root = os.path.dirname(__file__)
    with open(os.path.join(root, "requirements.txt"), encoding="utf-8") as file:
        requirements = file.read()
    packages = [line.strip() for line in requirements.splitlines()
                if line.strip() and not line.lstrip().startswith("#")]
    missing = [package for package in packages if not check_pip(package)]
    if missing:
        print("Check SDVN-Comfy-Node: Installing missing or incompatible requirements...")
        try:
            subprocess.check_call([sys.executable, "-m", "pip", "install", *missing])
        except subprocess.CalledProcessError:
            print(f"SDVN: Dependency installation failed in {sys.executable}. "
                  "Check pip output above, network access and Python compatibility; "
                  "installation will be retried on the next startup.")
            raise
        invalidate_caches()
    file_check = os.path.join(root, "installed.txt")
    temporary = file_check + ".tmp"
    try:
        with open(temporary, "w", encoding="utf-8") as file:
            file.write(requirements)
        os.replace(temporary, file_check)
    except OSError as error:
        # This file is informational; dependency checks run on every startup.
        print(f"SDVN: Cannot write installed.txt: {error}")


install()

from .node.load import NODE_CLASS_MAPPINGS as load_node, NODE_DISPLAY_NAME_MAPPINGS as load_dis
from .node.merge import NODE_CLASS_MAPPINGS as merge_node, NODE_DISPLAY_NAME_MAPPINGS as merge_dis
from .node.creative import NODE_CLASS_MAPPINGS as creative_node, NODE_DISPLAY_NAME_MAPPINGS as creative_dis
from .node.api import NODE_CLASS_MAPPINGS as api_node, NODE_DISPLAY_NAME_MAPPINGS as api_dis
from .node.load_info import NODE_CLASS_MAPPINGS as load_info_node, NODE_DISPLAY_NAME_MAPPINGS as load_info_dis
from .node.image import NODE_CLASS_MAPPINGS as image_node, NODE_DISPLAY_NAME_MAPPINGS as image_dis
from .node.preset import NODE_CLASS_MAPPINGS as preset_node, NODE_DISPLAY_NAME_MAPPINGS as preset_dis
from .node.mask import NODE_CLASS_MAPPINGS as mask_node, NODE_DISPLAY_NAME_MAPPINGS as mask_dis
from .node.image_gallery import NODE_CLASS_MAPPINGS as image_gallery_node, NODE_DISPLAY_NAME_MAPPINGS as image_gallery_dis
from .node.group_tools import NODE_CLASS_MAPPINGS as group_tools_node, NODE_DISPLAY_NAME_MAPPINGS as group_tools_dis
from .node.chooser import NODE_CLASS_MAPPINGS as chooser_node, NODE_DISPLAY_NAME_MAPPINGS as chooser_dis
from .node.dev import NODE_CLASS_MAPPINGS as dev_node, NODE_DISPLAY_NAME_MAPPINGS as dev_dis

from .node.segment_anything.nodes import NODE_CLASS_MAPPINGS as segment_node, NODE_DISPLAY_NAME_MAPPINGS as segment_dis
from .node.promptgen import NODE_CLASS_MAPPINGS as promptgen_node, NODE_DISPLAY_NAME_MAPPINGS as promptgen_dis

NODE_CLASS_MAPPINGS = {
    **load_node,
    **merge_node,
    **creative_node,
    **api_node,
    **load_info_node,
    **image_node,
    **preset_node,
    **mask_node,
    **image_gallery_node,
    **group_tools_node,
    **chooser_node,
    **dev_node,
    **segment_node,
    **promptgen_node
}
NODE_DISPLAY_NAME_MAPPINGS = {
    **load_dis,
    **merge_dis,
    **creative_dis,
    **api_dis,
    **load_info_dis,
    **image_dis,
    **preset_dis,
    **mask_dis,
    **image_gallery_dis,
    **group_tools_dis,
    **chooser_dis,
    **dev_dis,
    **segment_dis,
    **promptgen_dis
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
WEB_DIRECTORY = "js"
