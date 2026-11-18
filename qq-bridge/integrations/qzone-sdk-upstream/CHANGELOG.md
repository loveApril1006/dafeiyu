# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.1] - 2026-08-05

### 修复

- **删除说说的 CLI 闭环**：`delete` 的 `feedsKey`（curkey）实际必传，此前留空会报 `-10004 参数错误`，导致「发布 → 删除」按文档操作断链。现改为 curkey 留空时自动用 tid 兜底（新发布的说说二者相同）
- `publish` 返回值补充 `curkey` 字段，便于删除时使用
- README / `qzone delete --help` 同步说明该行为

## [1.0.0] - 2026-08-05

### 新增

- **标准包结构**：`src/` 布局，按 `client / auth / utils / cli` 拆分模块，零运行时依赖
- **三种认证方式**：
  - 扫码登录（`QRCodeLoginProvider` / `qzone login --save`）：手机 QQ 扫码即用，无需 NapCat
  - NapCat WebSocket（`NapCatAuthProvider`）：自动获取 Cookie，随取随用
  - 手动 Cookie（`ManualCookieProvider`）与凭证文件（`CookieFileProvider`）
- **零配置使用**：`QZoneClient()` 自动识别认证（环境变量 Cookie → 凭证文件 → NapCat），并支持 `QZoneClient(auth_provider=...)` 直传
- **NapCat 在线优先**：配置 QQ 号（`QZONE_UIN`）后，NapCat 在线自动优先使用（含 QQ 号一致性校验），离线自动回退凭证文件 / 扫码登录
- **终端二维码**：`qzone login` 的二维码直接显示在控制台（纯标准库 PNG 解码 + 半块字符渲染，零依赖），同时打印图片绝对路径
- **完整 CLI**：`qzone` 命令（发布/删除/点赞/评论/转发/动态/说说/登录），每个命令独立 `--help`
- **核心操作**：发布说说（纯文本 / 带图 / 可见范围）、删除、点赞、评论、转发、好友动态、指定好友说说
- **异常体系**：`QZoneError` / `QZoneAuthError` / `QZoneApiError` / `QZoneNetworkError`
- **示例代码**：`examples/` 提供快速开始 / 扫码登录 / NapCat 接入 / 自定义认证四组可运行示例
- **单元测试**：覆盖哈希算法、PNG 解码/渲染、JSONP/说说解析、认证解析、CLI 等

### 修复

- `skey` 解析 bug：原正则会把 `p_skey=` 中的 `skey=` 子串误当作 `skey` 的值，现已锚定 Cookie 名起始位置
- 扫码登录换票失败：ptuiCB 回调第 6 参数是**昵称**而非 QQ 号，误用中文昵称拼入换票 URL 导致 `UnicodeEncodeError`；改为优先从跳转地址 `clientuin` / 服务端 Cookie 提取 QQ 号，并增加非 ASCII 地址防护与兜底跟随跳转
- 腾讯登录接口缺浏览器 UA 返回 403、扫码轮询 URL 二次编码触发风控：均已修复
- `richtype` 参数：纯文本说说使用空字符串而非 `"0"`，避免服务器误判为含链接导致 -10061 错误

### 已知限制

- 图片上传需要 QQ 空间相册权限正常
- 部分接口在高频调用时可能触发 QQ 风控
