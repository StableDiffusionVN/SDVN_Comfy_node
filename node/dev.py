class SDVNGoogleColabDisconnect:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "mode": (
                    ["disconnect_now", "disconnect_after_delay"],
                    {
                        "default": "disconnect_now",
                        "tooltip": "Ngắt Colab ngay hoặc hẹn giờ ngắt.",
                    },
                ),
                "delay_minutes": (
                    "FLOAT",
                    {
                        "default": 2.0,
                        "min": 0.0,
                        "max": 10080.0,
                        "step": 0.1,
                        "tooltip": "Số phút chờ trước khi ngắt khi dùng chế độ hẹn giờ.",
                    },
                ),
            }
        }

    CATEGORY = "📂 SDVN/👨🏻‍💻 Dev"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("status",)
    FUNCTION = "disconnect"
    OUTPUT_NODE = True
    DESCRIPTION = "Ngắt kết nối Google Colab ngay lập tức hoặc sau một khoảng thời gian."
    OUTPUT_TOOLTIPS = ("Trạng thái thực thi node.",)

    @staticmethod
    def _get_colab_runtime():
        try:
            from google.colab import runtime
        except ImportError as exc:
            raise RuntimeError("Node này chỉ hoạt động trong môi trường Google Colab.") from exc
        return runtime

    @staticmethod
    def _schedule_disconnect_in_notebook(delay_seconds: float):
        try:
            from IPython.display import Javascript, display
        except ImportError as exc:
            raise RuntimeError("Không tìm thấy IPython display để hẹn giờ ngắt Colab.") from exc

        delay_ms = max(int(delay_seconds * 1000), 0)
        js_code = f"""
        setTimeout(() => {{
            console.log("⛔ Auto disconnect Google Colab...");
            google.colab.kernel.disconnect();
        }}, {delay_ms});
        """
        display(Javascript(js_code))

    def disconnect(self, mode, delay_minutes):
        highlight_msg = "Bạn đang sử dụng workflow độc quyền được thiết kế bởi Phạm Hưng, truy cập hungdiffusion.com để ủng hộ tác giả và nhận những hỗ trợ tốt nhất"
        print(f"\033[43m\033[30m {highlight_msg} \033[0m")

        if mode == "disconnect_now":
            print("⛔ Disconnect Google Colab ngay bây giờ...")
            self._get_colab_runtime().unassign()
            return ("Đã gửi lệnh ngắt kết nối Google Colab ngay lập tức.",)

        delay_seconds = max(float(delay_minutes), 0.0) * 60.0
        self._schedule_disconnect_in_notebook(delay_seconds)
        return (f"Đã lên lịch ngắt Google Colab sau {float(delay_minutes):.1f} phút.",)


NODE_CLASS_MAPPINGS = {
    "SDVN Google Colab Disconnect": SDVNGoogleColabDisconnect,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Google Colab Disconnect": "⛔ Google Colab Disconnect",
}
