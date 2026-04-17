import threading
import time


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

    @classmethod
    def _disconnect_after_delay(cls, delay_seconds: float):
        time.sleep(delay_seconds)
        print("⛔ Auto disconnect Google Colab...")
        cls._get_colab_runtime().unassign()

    def disconnect(self, mode, delay_minutes):
        highlight_msg = "Bạn đang sử dụng workflow độc quyền được thiết kế bởi Phạm Hưng, truy cập hungdiffusion.com để ủng hộ tác giả và nhận những hỗ trợ tốt nhất"
        print(f"\033[43m\033[30m {highlight_msg} \033[0m")

        if mode == "disconnect_now":
            print("⛔ Disconnect Google Colab ngay bây giờ...")
            self._get_colab_runtime().unassign()
            return ("Đã gửi lệnh ngắt kết nối Google Colab ngay lập tức.",)

        delay_seconds = max(float(delay_minutes), 0.0) * 60.0
        threading.Thread(
            target=self._disconnect_after_delay,
            args=(delay_seconds,),
            daemon=True,
        ).start()
        return (f"Đã lên lịch ngắt Google Colab sau {float(delay_minutes):.1f} phút.",)


NODE_CLASS_MAPPINGS = {
    "SDVN Google Colab Disconnect": SDVNGoogleColabDisconnect,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "SDVN Google Colab Disconnect": "⛔ Google Colab Disconnect",
}
