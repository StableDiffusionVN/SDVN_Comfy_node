import subprocess
import sys, os

import platform, urllib.request, zipfile, shutil

def ensure_aria2_installed():
    system = platform.system().lower()
    if system == "windows":
        try:
            subprocess.run(["aria2c", "--version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print("✅ Đã cài aria2c.")
            return
        except (subprocess.CalledProcessError, FileNotFoundError):
            print("⚠️ Chưa cài aria2c. Tiến hành cài đặt...")

        aria2_url = "https://github.com/aria2/aria2/releases/download/release-1.36.0/aria2-1.36.0-win-64bit-build1.zip"
        temp_zip = os.path.join(os.environ["TEMP"], "aria2.zip")
        install_dir = os.path.join(os.environ["ProgramFiles"], "aria2")

        try:
            urllib.request.urlretrieve(aria2_url, temp_zip)
            if os.path.exists(install_dir):
                shutil.rmtree(install_dir)
            with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
                zip_ref.extractall(install_dir)
            os.environ["PATH"] += os.pathsep + install_dir
            subprocess.run(["aria2c", "--version"])
            print("✅ Đã cài aria2c thành công!")
        except Exception as e:
            print("❌ Lỗi khi cài aria2c, nên cài đặt thủ công để tự động tải model:", e)
    elif system == "linux":
        try:
            print("✅ Đang cài fonts-jetbrains-mono trên Linux...")
            subprocess.check_call(["sudo", "apt", "install", "-y", "fonts-jetbrains-mono"])
            print("✅ Đã cài fonts-jetbrains-mono thành công!")
        except Exception as e:
            print("❌ Lỗi khi cài fonts-jetbrains-mono:", e)

ensure_aria2_installed()

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
from .node.api import NODE_CLASS_MAPPINGS as api_node, NODE_DISPLAY_NAME_MAPPINGS as api_dis
from .node.load_info import NODE_CLASS_MAPPINGS as load_info_node, NODE_DISPLAY_NAME_MAPPINGS as load_info_dis
from .node.image import NODE_CLASS_MAPPINGS as image_node, NODE_DISPLAY_NAME_MAPPINGS as image_dis
from .node.preset import NODE_CLASS_MAPPINGS as preset_node, NODE_DISPLAY_NAME_MAPPINGS as preset_dis
from .node.mask import NODE_CLASS_MAPPINGS as mask_node, NODE_DISPLAY_NAME_MAPPINGS as mask_dis
from .node.image_gallery import NODE_CLASS_MAPPINGS as image_gallery_node, NODE_DISPLAY_NAME_MAPPINGS as image_gallery_dis

NODE_CLASS_MAPPINGS = {
    **load_node,
    **merge_node,
    **creative_node,
    **api_node,
    **load_info_node,
    **image_node,
    **preset_node,
    **mask_node,
    **image_gallery_node
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
    **image_gallery_dis
}

__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
WEB_DIRECTORY = "js"

