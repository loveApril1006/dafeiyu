from qzone_sdk.constants import UA
from qzone_sdk.utils.http import HttpSession


class FakeResponse:
    def __init__(self, data: bytes):
        self._data = data

    def read(self):
        return self._data


class FakeOpener:
    def __init__(self, data: bytes = b'frameElement.callback({"code":0})'):
        self._data = data
        self.captured = {}

    def open(self, req, timeout=None):
        self.captured = {
            "ua": req.get_header("User-agent"),
            "accept": req.get_header("Accept"),
            "cookie": req.get_header("Cookie"),
            "timeout": timeout,
        }
        return FakeResponse(self._data)


def test_default_headers_applied_and_overridden(monkeypatch):
    session = HttpSession()
    opener = FakeOpener()
    monkeypatch.setattr(session, "_opener", opener)

    result = session.post("https://example.invalid/x", {"a": 1}, {"Cookie": "p_skey=1"}, 30)

    assert result == {"code": 0}
    assert opener.captured["ua"] == UA              # 默认浏览器 UA
    assert "text/html" in opener.captured["accept"]
    assert opener.captured["cookie"] == "p_skey=1"  # 调用方头覆盖默认
    assert opener.captured["timeout"] == 30         # 超时正确传递


def test_raw_get_returns_bytes(monkeypatch):
    session = HttpSession()
    opener = FakeOpener(data=b"\x89PNG-bytes")
    monkeypatch.setattr(session, "_opener", opener)

    assert session.raw_get("https://example.invalid/img", {}, 10) == b"\x89PNG-bytes"
