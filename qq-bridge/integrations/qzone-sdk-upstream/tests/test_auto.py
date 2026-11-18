import asyncio

import pytest

from qzone_sdk.auth import AutoAuthProvider
from qzone_sdk.auth.base import AuthProvider, auth_from_cookies
from qzone_sdk.errors import QZoneAuthError


class _FailProvider(AuthProvider):
    async def get_auth(self):
        raise QZoneAuthError("模拟失败")


class _OkProvider(AuthProvider):
    async def get_auth(self):
        return auth_from_cookies("p_skey=a; skey=b", "1")


def test_auto_fallback_to_next():
    provider = AutoAuthProvider([_FailProvider(), _OkProvider()])
    auth = asyncio.run(provider.get_auth())
    assert auth.uin == "1"


def test_auto_all_fail():
    provider = AutoAuthProvider([_FailProvider()])
    with pytest.raises(QZoneAuthError):
        asyncio.run(provider.get_auth())


def test_auto_requires_candidates():
    with pytest.raises(ValueError):
        AutoAuthProvider([])
