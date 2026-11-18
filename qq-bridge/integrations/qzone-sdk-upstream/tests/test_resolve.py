import json

from qzone_sdk import QZoneClient, QRCodeLoginProvider
from qzone_sdk.auth import (
    AutoAuthProvider,
    CookieFileProvider,
    ManualCookieProvider,
    NapCatAuthProvider,
    resolve_provider,
)


def test_resolve_env_cookie(monkeypatch):
    monkeypatch.setenv("QZONE_COOKIE", "p_skey=a; skey=b")
    monkeypatch.setenv("QZONE_UIN", "123")
    provider = resolve_provider()
    assert isinstance(provider, ManualCookieProvider)
    assert provider._cookies == "p_skey=a; skey=b"


def test_resolve_cookie_file(monkeypatch, tmp_path):
    monkeypatch.delenv("QZONE_COOKIE", raising=False)
    monkeypatch.delenv("QZONE_UIN", raising=False)
    f = tmp_path / "cookies.json"
    f.write_text(json.dumps({"cookies": "p_skey=x", "uin": "1"}), encoding="utf-8")
    provider = resolve_provider(cookie_file=str(f))
    # 未配置 QQ 号但有凭证文件 → 凭证文件为第一候选，NapCat 兜底
    assert isinstance(provider, AutoAuthProvider)
    assert isinstance(provider.candidates[0], CookieFileProvider)
    assert isinstance(provider.candidates[1], NapCatAuthProvider)


def test_resolve_napcat_fallback(monkeypatch):
    monkeypatch.delenv("QZONE_COOKIE", raising=False)
    monkeypatch.delenv("QZONE_UIN", raising=False)
    monkeypatch.delenv("QZONE_WS_URL", raising=False)
    monkeypatch.setattr("qzone_sdk.auth.resolve.default_cookie_file", lambda: "/nonexistent/cookies.json")
    provider = resolve_provider()
    assert isinstance(provider, NapCatAuthProvider)


def test_resolve_napcat_first_when_uin(monkeypatch, tmp_path):
    # 配置 QQ 号 + 存在凭证文件 → AutoAuthProvider，且 NapCat 为第一候选（在线优先）
    monkeypatch.setenv("QZONE_UIN", "123")
    monkeypatch.delenv("QZONE_COOKIE", raising=False)
    monkeypatch.delenv("QZONE_WS_URL", raising=False)
    f = tmp_path / "cookies.json"
    f.write_text(json.dumps({"cookies": "p_skey=x", "uin": "1"}), encoding="utf-8")
    provider = resolve_provider(cookie_file=str(f))
    assert isinstance(provider, AutoAuthProvider)
    assert isinstance(provider.candidates[0], NapCatAuthProvider)
    assert isinstance(provider.candidates[1], CookieFileProvider)


def test_resolve_napcat_direct_when_uin_no_cookie(monkeypatch):
    monkeypatch.setenv("QZONE_UIN", "123")
    monkeypatch.delenv("QZONE_COOKIE", raising=False)
    monkeypatch.delenv("QZONE_WS_URL", raising=False)
    monkeypatch.setattr("qzone_sdk.auth.resolve.default_cookie_file", lambda: "/nonexistent/cookies.json")
    provider = resolve_provider()
    assert isinstance(provider, NapCatAuthProvider)


def test_resolve_cookie_file_before_napcat(monkeypatch, tmp_path):
    # 未配置 QQ 号但有凭证文件 → 凭证文件为第一候选，NapCat 兜底
    monkeypatch.delenv("QZONE_COOKIE", raising=False)
    monkeypatch.delenv("QZONE_UIN", raising=False)
    f = tmp_path / "cookies.json"
    f.write_text(json.dumps({"cookies": "p_skey=x", "uin": "1"}), encoding="utf-8")
    provider = resolve_provider(cookie_file=str(f))
    assert isinstance(provider, AutoAuthProvider)
    assert isinstance(provider.candidates[0], CookieFileProvider)
    assert isinstance(provider.candidates[1], NapCatAuthProvider)


def test_client_auto_resolve(monkeypatch):
    monkeypatch.setenv("QZONE_COOKIE", "p_skey=a; skey=b")
    monkeypatch.setenv("QZONE_UIN", "123")
    client = QZoneClient()
    assert isinstance(client.config.auth_provider, ManualCookieProvider)


def test_client_explicit_provider():
    client = QZoneClient(auth_provider=QRCodeLoginProvider())
    assert isinstance(client.config.auth_provider, QRCodeLoginProvider)
