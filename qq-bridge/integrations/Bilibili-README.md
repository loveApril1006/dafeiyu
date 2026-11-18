# 小鸽子 B站阅读

> 2026-10-25 已升级为原版完整鱼塘。当前入口和部署说明见 [Native-Pond-README.md](Native-Pond-README.md)。
> 下方保留早期基础版说明；其中“未迁移”的功能清单不再描述当前完整鱼塘。

本模块部署在 QQ Bridge 的生活服务中，不注册 DSH bundle、设置页或侧边栏。
模型推理仍使用机器人现有的 DSH 模型线路；B站请求在独立 Python 环境中执行。

源代码基于 https://github.com/YOYOLnFu/dsh-bili-pond 的 MIT 后端，取自
923d884698bb7b3b9de8a651de970c801bf10d0d。上游源码及 LICENSE、NOTICE.md
保存在 `bili-pond-upstream/`；B站适配底层来自 AGI_Ananas/bilibili-mcp（MIT）。
未修改上游文件，通过 bilibili-worker.py 为其指定独立凭据目录和动作白名单。

## 使用

机器人后台 http://127.0.0.1:3100 → B站阅读：扫码登录、设置关键词、人设、
自动阅读间隔和配额；搜索、指定视频总结、查看今日阅读日报。

管理员 QQ 私聊：

- `#B站状态`
- `#搜B站 AI开源项目`
- `#看B站 BV1EPnG6DEJC`
- `#刷B站`（后台开始一轮，之后读取日报）
- `#B站日报`
- `#B站评论 BV1EPnG6DEJC 正文`（原文发送，无模型代写，无自动重试）

每天最多6轮，每轮1～3条；已读取的BV号不会在刷一轮时重复阅读。
摘要使用实际字幕，不支持无字幕视频的本地转写、画面理解，也没有迁移上游的
评论守护、自动互动和私信功能。没有读到字幕就明确跳过。
历史、阅读感受、日报及扫码凭据只在 `companion/bilibili-data/`；不共用 DSH 插件数据。
自动运行默认关闭，开启后仅保存本地结果。评论只能由管理员私聊明确发出。

环境安装：`powershell -ExecutionPolicy Bypass -File integrations/Install-Bilibili.ps1`，
需要 uv；安装后重启生活服务和 QQ Bridge。不需重启 DSH。
这次更新部署到本机源目录，尚未更新已有换机 ZIP 安装包。

验证：`npm run test:bilibili` 通过；生活功能原有回归通过。Playwright已验证桌面/手机布局、
保存偏好、外部标题按文本显示、扫码图片显示。真实本机3100→17867代理、运行环境、
B站搜索及真实登录二维码渲染通过；未登录账号，未发送任何真实QQ消息或B站评论，
因此登录后的字幕读取/模型总结需扫码后再试。DSH仍连接，desktop profile无此插件bundle。
