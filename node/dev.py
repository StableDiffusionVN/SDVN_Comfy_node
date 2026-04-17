import threading
import time


class SDVNGoogleColabDisconnect:
    NODE_LABEL = "SDVNGoogleColabDisconnect"

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
        delay_minutes = max(delay_seconds, 0.0) / 60.0
        print(
            f"\033[43m\033[30m [WARNING] Node {cls.NODE_LABEL} đang ngắt Google Colab sau {delay_minutes:.1f} phút chờ. \033[0m"
        )
        print("⛔ Auto disconnect Google Colab...")
        cls._get_colab_runtime().unassign()

    def disconnect(self, mode, delay_minutes):
        delay_minutes = max(float(delay_minutes), 0.0)
        print(
            f"\033[43m\033[30m [WARNING] Node {self.NODE_LABEL} đã chạy với mode={mode}, thời gian ngắt={delay_minutes:.1f} phút. \033[0m"
        )

        if mode == "disconnect_now":
            print(
                f"\033[43m\033[30m [WARNING] Node {self.NODE_LABEL} sẽ ngắt Google Colab ngay lập tức (0.0 phút). \033[0m"
            )
            print("⛔ Disconnect Google Colab ngay bây giờ...")
            self._get_colab_runtime().unassign()
            return ("Đã gửi lệnh ngắt kết nối Google Colab ngay lập tức.",)

        delay_seconds = delay_minutes * 60.0
        print(
            f"\033[43m\033[30m [WARNING] Node {self.NODE_LABEL} đã được lên lịch ngắt sau {delay_minutes:.1f} phút. \033[0m"
        )
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
