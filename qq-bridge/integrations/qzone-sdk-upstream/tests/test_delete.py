import asyncio

from qzone_sdk import QZoneClient
from qzone_sdk.auth import ManualCookieProvider


def _make_client():
    return QZoneClient(
        auth_provider=ManualCookieProvider("p_skey=a; skey=b", "123")
    )


def test_delete_curkey_fallback_to_tid(monkeypatch):
    """curkey 留空时 delete 应自动用 tid 兜底（修复 -10004 参数错误）。"""
    client = _make_client()
    captured = {}

    def fake_post(url, data, headers):
        captured.update(data)
        return {"code": 0, "tid": "abc"}

    monkeypatch.setattr(client, "_post", fake_post)

    result = asyncio.run(client.delete("abc"))
    assert result["success"] is True
    assert captured["feedsKey"] == "abc"


def test_delete_explicit_curkey_wins(monkeypatch):
    client = _make_client()
    captured = {}

    def fake_post(url, data, headers):
        captured.update(data)
        return {"code": 0, "tid": "abc"}

    monkeypatch.setattr(client, "_post", fake_post)

    asyncio.run(client.delete("abc", curkey="xyz"))
    assert captured["feedsKey"] == "xyz"
