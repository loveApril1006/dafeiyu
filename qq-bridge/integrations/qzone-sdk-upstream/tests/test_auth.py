import pytest

from qzone_sdk.auth.base import auth_from_cookies
from qzone_sdk.auth.qrcode import LoginStatus, QRCodeLoginProvider, _guess_uin
from qzone_sdk.errors import QZoneAuthError, QZoneNetworkError
from qzone_sdk.utils.gtk import compute_g_tk


def test_auth_from_cookies():
    auth = auth_from_cookies("p_skey=abc; skey=xyz; p_uin=o123456", "123456")
    assert auth.uin == "123456"
    assert auth.p_skey == "abc"
    assert auth.skey == "xyz"
    assert auth.g_tk == compute_g_tk("abc")


def test_auth_from_cookies_missing_p_skey():
    with pytest.raises(QZoneAuthError):
        auth_from_cookies("skey=xyz", "1")


def test_parse_callback_waiting():
    body = "ptuiCB('66','0','','0','二维码未失效','')"
    state = QRCodeLoginProvider._parse_callback(body)
    assert state.status is LoginStatus.WAITING


def test_parse_callback_success():
    body = (
        "ptuiCB('0','0','https://ssl.ptlogin2.qq.com/pt4_auth?clientuin=123456789&daid=5','0',"
        "'登录成功！','小明')"
    )
    state = QRCodeLoginProvider._parse_callback(body)
    assert state.status is LoginStatus.SUCCESS
    assert state.nick == "小明"
    # 昵称不能当 uin 用，但跳转地址里的 clientuin 是真实 QQ 号
    assert _guess_uin(state.redirect_url, state.nick) == "123456789"


def test_guess_uin_prefers_clientuin():
    assert _guess_uin("https://x/pt4_auth?clientuin=888&daid=5", "小明") == "888"


def test_guess_uin_digit_nick():
    assert _guess_uin("", "123456789") == "123456789"


def test_guess_uin_chinese_nick_rejected():
    # 中文昵称绝不能当作 uin 传入 URL（否则触发 UnicodeEncodeError）
    assert _guess_uin("", "小明") == ""


def test_parse_callback_with_ptsigx():
    body = "ptuiCB('0','0','','0','登录成功！','123');location.replace('x&ptsigx=abc123&y=1')"
    state = QRCodeLoginProvider._parse_callback(body)
    assert state.ptsigx == "abc123"


def test_parse_callback_unknown_status():
    with pytest.raises(QZoneNetworkError):
        QRCodeLoginProvider._parse_callback("ptuiCB('999','0','','0','未知','')")


def test_finish_login_requires_success():
    provider = QRCodeLoginProvider()
    with pytest.raises(QZoneAuthError):
        import asyncio
        asyncio.run(provider.finish_login())
