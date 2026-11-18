"""扫码登录（无需 NapCat）：生成二维码 → 轮询扫码 → 可选保存凭证。

用法：python examples/qrcode_login.py [--save]
加 --save 会把凭证写入 ~/.qzone_sdk/cookies.json，之后 QZoneClient() 可直接使用。
"""
import asyncio
import sys

from qzone_sdk import QZoneConfig, QZoneClient, QRCodeLoginProvider
from qzone_sdk.auth import save_cookie_file


async def main():
    provider = QRCodeLoginProvider(qr_path="qrcode.png")

    def on_status(msg: str):
        print(msg)

    print("=== 扫码登录 ===")
    auth = await provider.get_auth(on_status=on_status)
    print(f"登录成功！QQ: {auth.uin}")

    if "--save" in sys.argv:
        path = save_cookie_file(auth)
        print(f"凭证已保存到: {path}")

    # 用扫码凭证直接操作
    client = QZoneClient(QZoneConfig(auth_provider=provider))
    result = await client.publish("通过扫码登录发布！")
    print("发布结果:", result)


if __name__ == "__main__":
    asyncio.run(main())
