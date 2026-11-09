"""aPix license: download private SDVN models with an aPix key instead of a HuggingFace token.

The key never travels inside a workflow (ComfyUI stores workflows in output PNGs and
/history). aPix Builder pushes it once per session to POST /sdvn/apix/session; on Colab
it can also come from the APIX_KEY environment variable or "aPix" in API_key.json.
The key is exchanged at the license server for a short-lived session token, and every
private model download asks the server for a signed CDN link — the HuggingFace token
stays on the server.
"""
import json
import os
import threading
import time
import uuid

import requests

LICENSE_URL = os.getenv("APIX_LICENSE_URL", "https://apix.sdvn.vn/license").rstrip("/")
_API_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "API_key.json")
_lock = threading.Lock()
_state = {"key": None, "token": None, "expires": 0.0, "label": "", "error": "", "device": ""}
# A key may be installed on many machines but may limit how many RUN at once. aPix Builder sends its
# machine id with the key so this server's downloads count as that machine; a key set directly here
# (APIX_KEY / API_key.json) counts as this ComfyUI server.
_SERVER_DEVICE = f"comfy-{uuid.uuid4()}"


class ApixLicenseError(RuntimeError):
    pass


def _configured_key():
    key = os.getenv("APIX_KEY", "").strip()
    if key:
        return key
    try:
        with open(_API_FILE, "r", encoding="utf-8") as f:
            key = str(json.load(f).get("aPix", "")).strip()
        return key if key.startswith("apx_") else None
    except (OSError, ValueError, AttributeError):
        return None


def has_key():
    return bool(_state["key"] or _configured_key())


def _post(route, payload):
    try:
        response = requests.post(f"{LICENSE_URL}{route}", json=payload, timeout=20)
    except requests.RequestException as error:
        raise ApixLicenseError(f"Không kết nối được license server aPix: {error}") from error
    try:
        data = response.json()
    except ValueError:
        data = {}
    return response.status_code, data


def _open_session(key):
    status, data = _post("/v1/session", {"key": key, "deviceId": _state["device"] or _SERVER_DEVICE})
    if status != 200 or not data.get("token"):
        raise ApixLicenseError(data.get("error") or f"License server trả lỗi {status}")
    expires = time.time() + 6 * 3600
    try:
        from datetime import datetime
        expires = datetime.fromisoformat(data["expiresAt"].replace("Z", "+00:00")).timestamp()
    except (KeyError, ValueError):
        pass
    _state.update(key=key, token=data["token"], expires=expires, label=data.get("label", ""), error="")


def set_key(key, device=""):
    """Validate a key now (called by aPix through the HTTP route)."""
    key = str(key or "").strip()
    if not key:
        raise ApixLicenseError("Thiếu mã aPix")
    with _lock:
        _state.update(device=str(device or "")[:80])
        try:
            _open_session(key)
        except ApixLicenseError as error:
            _state.update(error=str(error))
            raise
    return status()


def status():
    return {
        "active": bool(_state["token"]) and _state["expires"] > time.time(),
        "label": _state["label"],
        "expiresAt": _state["expires"] or None,
        "configured": has_key(),
        "error": _state["error"],
    }


def _token():
    with _lock:
        if _state["token"] and _state["expires"] - 60 > time.time():
            return _state["token"]
        key = _state["key"] or _configured_key()
        if not key:
            raise ApixLicenseError(
                "Model [SDVN] cần mã aPix: nhập mã trong aPix Builder (Settings) hoặc đặt APIX_KEY trên Colab."
            )
        _open_session(key)
        return _state["token"]


def signed_download_url(url):
    """Signed CDN link for a protected model, or None when the model is public."""
    for attempt in range(2):
        status_code, data = _post("/v1/download-url", {"token": _token(), "url": url})
        if status_code == 401 and attempt == 0:
            with _lock:
                _state.update(token=None, expires=0.0)
            continue
        if status_code == 200:
            if data.get("public"):
                return None
            if data.get("url"):
                return data["url"]
        raise ApixLicenseError(data.get("error") or f"License server trả lỗi {status_code}")
    raise ApixLicenseError("Phiên aPix không hợp lệ")


def _register_routes():
    try:
        from aiohttp import web
        from server import PromptServer
    except Exception:  # Not running inside ComfyUI (tests, CLI)
        return
    routes = PromptServer.instance.routes

    @routes.post("/sdvn/apix/session")
    async def apix_session(request):
        try:
            data = await request.json()
        except Exception:
            data = {}
        import asyncio
        try:
            result = await asyncio.to_thread(set_key, data.get("key"), data.get("deviceId"))
            return web.json_response({"ok": True, **result})
        except ApixLicenseError as error:
            return web.json_response({"ok": False, "error": str(error)}, status=401)

    @routes.get("/sdvn/apix/status")
    async def apix_status(_request):
        return web.json_response(status())


_register_routes()
