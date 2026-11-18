# qzone-sdk

> 轻量级、零第三方依赖的 QQ 空间操作 Python SDK

[![Python 3.10+](https://img.shields.io/badge/python-3.10+-blue.svg)](https://www.python.org/downloads/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen.svg)]()
[![PyPI](https://img.shields.io/pypi/v/qzone-sdk.svg)](https://pypi.org/project/qzone-sdk/)

纯 Python 标准库实现的 QQ 空间操作库：发布/删除/点赞/评论/转发说说、获取好友动态与好友说说。内置**三种认证方式**，其中扫码登录让不熟悉 NapCat 的用户也能零门槛使用。

## 功能

| 功能 | 说明 |
|---|---|
| 发布说说 | 纯文本 / 带图片 / 可见范围控制 |
| 删除说说 | 按 tid 删除 |
| 点赞 / 评论 / 转发 | 与好友说说互动 |
| 好友动态 | 获取信息流 |
| 好友说说 | 获取指定好友的说说列表 |

## 安装

```bash
pip install qzone-sdk
```

零第三方依赖。仅 NapCat 认证方式需要额外依赖：

```bash
pip install "qzone-sdk[napcat]"
```

## 认证方式

| 方式 | 说明 | 适用场景 |
|---|---|---|
| **扫码登录**（推荐） | `qzone login --save` 手机 QQ 扫码，之后无需任何额外服务 | 个人使用，零门槛 |
| **NapCat WebSocket** | 自动获取当前登录 QQ 的 Cookie，随取随用 | 已有 NapCat 的 QQ 机器人/自动化 |
| **手动 Cookie** | 从浏览器 DevTools 复制 Cookie | 调试 / 一次性使用 |

> **为什么推荐扫码登录？** 其他方案要么需要部署 NapCat 协议端，要么需要手动抓 Cookie。扫码登录一次（`--save` 保存凭证）后，后续所有命令开箱即用。

## 命令行

### 首次使用（推荐）

```bash
# 扫码登录并保存凭证（只需一次）
qzone login --save
```

二维码会**直接显示在终端**（手机即可扫描），同时保存为图片文件并打印绝对路径。成功后输出 `凭证已保存到: ~/.qzone_sdk/cookies.json`，之后直接使用下面的命令即可。

### 命令总览

```bash
qzone --help                       # 查看所有命令与认证参数
qzone --version                    # 查看版本

qzone publish "你好，世界"                       # 发布纯文本说说
qzone publish "看这张图" --image a.jpg b.jpg    # 发布带图说说（最多 9 张）
qzone publish "私密日记" --visible 4            # 仅自己可见（1=公开 3=好友 4=仅自己）

qzone feed --count 10              # 获取好友动态
qzone moods 123456789 --num 5      # 获取指定好友说说
qzone delete <tid>                 # 删除说说（curkey 留空自动用 tid，新发说说可直接删）
qzone like <QQ号> <fid> <cur_key> <uni_key>    # 点赞
qzone comment <QQ号> <topicId> "好棒！"          # 评论
qzone forward <QQ号> <tid> "转发附言"            # 转发
```

> **删除说说小贴士**：`qzone publish` 发布的说说可直接 `qzone delete <tid>` 删除（curkey 留空会自动用 tid 兜底，二者对新说说相同）。`publish` 返回结果里也带 `curkey` 字段可供删除使用。删除很久以前的旧说说时，建议先从 `qzone moods` 获取准确 key。

每个命令都有完整帮助，例如 `qzone publish --help`。

### 认证优先级

未显式指定时，自动选择认证方式（CLI 与 `QZoneClient()` 一致）：

1. 手动 Cookie：环境变量 `QZONE_COOKIE` + `QZONE_UIN`（显式指定，最高优先）
2. **配置了 QQ 号（`QZONE_UIN`）→ 先探测 NapCat，在线则直接使用**（无需任何手动操作）
3. Cookie 文件（`--cookie-file` / `QZONE_COOKIE_FILE` / 默认 `~/.qzone_sdk/cookies.json` 存在时）
4. NapCat WebSocket（`--ws-url` / `QZONE_WS_URL` / 默认 `ws://localhost:3001`）
5. CLI 交互模式下 NapCat 离线时，自动引导扫码登录

也可用 `--auth {napcat,cookie,qrcode}` 强制指定。

**配置 QQ 号**：设置环境变量 `QZONE_UIN` 即可，例如 Windows 下 `set QZONE_UIN=123456789`。配置后 NapCat 在线时自动优先走 NapCat（还会校验登录的 QQ 号是否一致），离线时自动回退其他方式。

| 环境变量 | 说明 | 默认值 |
|---|---|---|
| `QZONE_WS_URL` | NapCat WebSocket 地址 | `ws://localhost:3001` |
| `QZONE_COOKIE` | 手动 Cookie 字符串 | — |
| `QZONE_UIN` | QQ 号：配置后 NapCat 在线时自动优先使用（配合 `QZONE_COOKIE` 则为手动 Cookie） | — |
| `QZONE_COOKIE_FILE` | Cookie 文件路径 | `~/.qzone_sdk/cookies.json` |

## Python 库

### 最简用法（推荐）

先扫码登录一次保存凭证，然后零配置直接使用：

```python
import asyncio
from qzone_sdk import QZoneClient

async def main():
    client = QZoneClient()   # 自动识别认证：环境变量 Cookie → 凭证文件 → NapCat
    result = await client.publish("你好，世界")
    print(result)

asyncio.run(main())
```

`QZoneClient()` 会自动按序选择认证方式，无需记忆任何类名。

### 显式指定认证方式

```python
# 扫码登录
from qzone_sdk import QRCodeLoginProvider
client = QZoneClient(auth_provider=QRCodeLoginProvider())

# NapCat
from qzone_sdk import NapCatAuthProvider
client = QZoneClient(auth_provider=NapCatAuthProvider(ws_url="ws://localhost:3001"))

# 手动 Cookie
from qzone_sdk import ManualCookieProvider
client = QZoneClient(auth_provider=ManualCookieProvider(
    cookies="p_skey=xxx; skey=xxx; ...", uin="123456789"))

# 完整配置（超时等）
from qzone_sdk import QZoneClient, QZoneConfig
client = QZoneClient(QZoneConfig(auth_provider=..., timeout=30))
```

### 完整示例

`examples/` 目录提供了可直接运行的真实示例：

| 示例 | 说明 | 运行 |
|---|---|---|
| `examples/quickstart.py` | 零配置最简用法 | `python examples/quickstart.py` |
| `examples/qrcode_login.py` | 扫码登录 + 保存凭证 | `python examples/qrcode_login.py --save` |
| `examples/napcat_bot.py` | 接入已有 NapCat 登录态 | `python examples/napcat_bot.py` |
| `examples/custom_auth.py` | 自定义认证（接入自己的凭证存储） | 需先准备 `my_credentials.json` |

## API 参考

### `QZoneClient`

```python
# 三种等价写法（按推荐程度排序）
client = QZoneClient()                              # 自动识别认证（推荐）
client = QZoneClient(auth_provider=QRCodeLoginProvider())
client = QZoneClient(QZoneConfig(auth_provider=..., timeout=30))
```

| 方法 | 参数 | 返回值 | 说明 |
|---|---|---|---|
| `publish()` | `content: str, visible: int = 1, image_paths: list[str] = None` | `dict` | 发布说说（visible: 1=公开 3=好友 4=仅自己）；返回含 `tid` 与 `curkey` |
| `delete()` | `tid: str, curkey: str = "", timestamp: int = 0` | `dict` | 删除说说（curkey 留空自动使用 tid） |
| `like()` | `target_qq: str, fid: str, cur_key: str, uni_key: str` | `dict` | 点赞 |
| `comment()` | `target_qq: str, fid: str, content: str` | `dict` | 评论 |
| `forward()` | `target_qq: str, tid: str, content: str = ""` | `dict` | 转发 |
| `get_feed_list()` | `page: int = 1, count: int = 10` | `list[dict]` | 好友动态 |
| `get_friend_moods()` | `qq: str, num: int = 10` | `list[dict]` | 指定好友说说 |

所有操作类方法返回 `dict`，包含 `success: bool` 字段。

### 认证提供者

| 类 | 构造参数 | 说明 |
|---|---|---|
| `QRCodeLoginProvider` | `qr_path="qrcode.png", timeout=10, poll_interval=3` | 手机 QQ 扫码登录，无需 NapCat |
| `NapCatAuthProvider` | `ws_url="ws://localhost:3001", timeout=10` | 经 NapCat WebSocket 自动获取 Cookie |
| `ManualCookieProvider` | `cookies: str, uin: str` | 手动 Cookie |
| `CookieFileProvider` | `path=None` | 读取 `qzone login --save` 的凭证文件 |

也可自定义认证方式：继承 `AuthProvider` 并实现 `async def get_auth() -> AuthInfo`。

### 异常

所有异常继承自 `QZoneError`：

| 异常 | 说明 |
|---|---|
| `QZoneAuthError` | 登录/凭证问题（Cookie 缺失、扫码失败等） |
| `QZoneApiError` | 接口返回 `code != 0` |
| `QZoneNetworkError` | 网络错误（超时、解析失败等） |

## 原理

### 认证与请求

```
认证提供者 ──► Cookie + g_tk ──► QQ 空间 CGI 接口
```

1. 认证提供者获取登录态（扫码 / NapCat / 手动 Cookie）
2. 从 `p_skey` 计算 `g_tk` 令牌（固定哈希算法）
3. 携带 `Cookie + g_tk` 请求 CGI 接口
4. 解析 JSONP 响应并统一为 `{"success": ...}` 格式

### 图片上传

本地图片 → base64 编码 → POST 到 `up.qzone.qq.com` → 返回 `lloc` → 发布时填入 `richval` 参数。

### 扫码登录流程

1. 请求 `ptqrshow` 获取二维码图片（保存到本地并打印路径）
2. 轮询 `ptqrlogin` 直到用户扫码确认
3. 用响应中的 `ptsigx` 请求 `check_sig` 换取 `p_skey` 等 Cookie

## 与其他库的对比

| 维度 | qzone-api | aioqzone | **qzone-sdk** |
|---|---|---|---|
| 许可证 | MIT | AGPL-3.0（传染性） | **MIT** |
| 依赖 | aiohttp | pydantic 等 | **零依赖** |
| 认证 | 二维码登录，需自行管理 Cookie | 二维码/密码+验证码 | **扫码 / NapCat / Cookie 三选一** |
| 图片说说 | ❌ | ✅ | ✅ |
| CLI | ❌ | ❌ | ✅ |

选择 qzone-sdk 的理由：MIT 许可（商用无忧）、零依赖（部署简单）、NapCat 生态天然衔接、自带完整 CLI。

## 安全提示

- Cookie 等同于账号的完全访问权限，**请勿泄露或提交到 git**（凭证文件在 POSIX 下会自动设为 600 权限）
- 请勿高频调用接口，避免触发 QQ 风控
- 本库仅供学习与个人自动化使用，请遵守相关平台规则

## 环境要求

- Python 3.10+
- 扫码模式：仅需能打开二维码图片
- NapCat 模式：NapCat 已登录运行，且 `pip install "qzone-sdk[napcat]"`

## 项目结构

```
qzone-sdk/
├── src/qzone_sdk/
│   ├── client.py        # QZoneClient 核心操作
│   ├── config.py        # QZoneConfig
│   ├── constants.py     # 接口地址与常量
│   ├── errors.py        # 异常体系
│   ├── auth/            # 认证提供者（扫码 / NapCat / Cookie / 自动解析）
│   ├── utils/           # HTTP / 解析等纯函数工具
│   └── cli.py           # qzone 命令行
├── examples/            # 可直接运行的示例
├── tests/               # 单元测试
├── pyproject.toml       # 打包配置
└── README.md
```

## 开发

```bash
pip install -e ".[dev]"
python -m pytest          # 运行测试
python -m build           # 构建 wheel / sdist
```

## 贡献

欢迎 PR！请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 协议

[MIT License](LICENSE)
