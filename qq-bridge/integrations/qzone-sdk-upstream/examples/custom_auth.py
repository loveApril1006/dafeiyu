"""自定义认证提供者示例：把凭证接入你自己的存储（数据库/密钥库/配置文件）。

继承 AuthProvider，实现 async def get_auth() -> AuthInfo 即可。
"""
import asyncio
import json

from qzone_sdk import AuthProvider, QZoneClient
from qzone_sdk.auth import auth_from_cookies

# 示例：你自己的凭证存储（真实场景请改为读数据库/密钥库）
CREDENTIALS_FILE = "my_credentials.json"


class MyVaultProvider(AuthProvider):
    """从自定义文件读取 Cookie（示例），也可改接任意存储。"""

    async def get_auth(self):
        with open(CREDENTIALS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        # auth_from_cookies 自动计算 g_tk 并校验 p_skey
        return auth_from_cookies(data["cookies"], str(data["uin"]))


async def main():
    client = QZoneClient(auth_provider=MyVaultProvider())
    result = await client.publish("来自自定义凭证存储的发布")
    print("发布结果:", result)


if __name__ == "__main__":
    asyncio.run(main())
