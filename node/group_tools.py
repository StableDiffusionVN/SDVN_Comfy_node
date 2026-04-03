class SDVNFastGroupsBypasser:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}}

    CATEGORY = "📂 SDVN/🛠️ Tools"
    RETURN_TYPES = ()
    FUNCTION = "noop"
    OUTPUT_NODE = True
    DESCRIPTION = "Node giao diện để bật/tắt nhanh trạng thái bypass của các group trong workflow."

    def noop(self):
        return ()


NODE_CLASS_MAPPINGS = {
    "SDVN Fast Groups Bypasser": SDVNFastGroupsBypasser,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Fast Groups Bypasser": "⚙️ Group Switch",
}
