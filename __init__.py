import subprocess
import sys, os

def check_pip(package_name):
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "show", package_name],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return True
    except subprocess.CalledProcessError as e:
        return False
    
def install():
    file_check = os.path.join(os.path.dirname(__file__),"installed.txt")
    if not os.path.exists(file_check):
        installed_package = []
    else:
        with open(file_check, 'r', encoding='utf-8') as file:
            installed_package = file.read().splitlines()
    list_check = os.path.join(os.path.dirname(__file__),"requirements.txt")
    with open(list_check, 'r', encoding='utf-8') as file:
        txt = file.read()
        list_package = txt.splitlines()
    if installed_package != list_package:
        print(f"\033[33m{'Check SDVN-Comfy-Node: If your Mac doesn t have aria2 installed, install it via brew'}\033[0m")
        for package_name in list_package:
            if "#" not in package_name and package_name not in installed_package:
                if check_pip(package_name):
                    print(f"Check SDVN-Comfy-Node: Package '{package_name}' is already installed.")
                else:
                    print(f"Check SDVN-Comfy-Node: Package '{package_name}' not found. Installing...")
                    subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])
            with open(file_check, "w") as file:
                file.write(txt)

install()

from .node.load import NODE_CLASS_MAPPINGS as load_node, NODE_DISPLAY_NAME_MAPPINGS as load_dis
from .node.merge import NODE_CLASS_MAPPINGS as merge_node, NODE_DISPLAY_NAME_MAPPINGS as merge_dis
from .node.creative import NODE_CLASS_MAPPINGS as creative_node, NODE_DISPLAY_NAME_MAPPINGS as creative_dis
from .node.chatbot import NODE_CLASS_MAPPINGS as chatbot_node, NODE_DISPLAY_NAME_MAPPINGS as chatbot_dis
from .node.load_info import NODE_CLASS_MAPPINGS as load_info_node, NODE_DISPLAY_NAME_MAPPINGS as load_info_dis
from .node.image import NODE_CLASS_MAPPINGS as image_node, NODE_DISPLAY_NAME_MAPPINGS as image_dis

NODE_CLASS_MAPPINGS = {
    **load_node,
    **merge_node,
    **creative_node,
    **chatbot_node,
    **load_info_node,
    **image_node,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    **load_dis,
    **merge_dis,
    **creative_dis,
    **chatbot_dis,
    **load_info_dis,
    **image_dis,
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
WEB_DIRECTORY = "./web"

