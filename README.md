# 大肥鱼

大肥鱼整合了 QQ ↔ DeepSeek Harness 桥接、桌宠、语音及社交平台适配。此目录为 GitHub 源码版，包含桥接、桌宠、集成组件、安装脚本和配置示例。各组件的原始许可和署名随源码保留，整合版的使用条件见 [版权与使用说明](版权与使用说明.txt)。

## 启动 QQ 桥接

安装 Node.js 22.13 或更高版本，准备可用的 DeepSeek Harness 和支持 OneBot v11 的 QQ 网关。首次配置可在 PowerShell 中执行以下命令。

```powershell
cd qq-bridge
npm ci
Copy-Item config.example.json config.json
```

先按 [桥接配置说明](qq-bridge/README.md#安装与配置) 设置 DSH 和 OneBot 接口，填入自己的凭据和授权名单，再运行 `npm start`。控制台令牌可留空，由程序首次启动时生成。

## 扩展功能

桌宠、语音和部分平台集成需要另行安装相应运行环境、浏览器、模型或授权素材。安装脚本按完整安装包的目录结构组装和运行，源码版需先准备组件。运行 Antigravity OAuth 需要在宿主进程环境中设置 `ANTIGRAVITY_CLIENT_ID` 和 `ANTIGRAVITY_CLIENT_SECRET`。

桌宠的构建与使用见 [桌宠说明](desktop-pet/开发与使用.md)，第三方集成见 [集成说明目录](qq-bridge/integrations)，安装脚本见 [打包说明](qq-bridge/packaging/README.md)。
