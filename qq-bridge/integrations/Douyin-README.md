# 机器人独立抖音集成

观看、人格、评论、好友回复与分享复用 LockyBee/dsh-douyin-agent 1.4.5（MIT），commit 3ff15a2c7e5ebe6423617f70a9859f2b46ae1993。
视频预检、上传、填写和发布复用 7gzgn/dsh-douyin-publish 0.6.4（MIT），commit 3413d538e2b4a3384092c456c56f97862f787fed。
两个源码目录保留 LICENSE、第三方声明与 Git 提交记录。没有注册 DSH bundle、设置页或工具。

入口：QQ Bridge 3100 控制台“抖音助手”，由 src/douyin-console.js 通过本机令牌调用
companion/douyin-service.mjs（17869）。服务按需启动，浏览器不会因打开设置页自动启动。
管理员 QQ 私聊支持 #抖音状态、#打开抖音、#刷抖音、#停止抖音、#抖音日报，
#发抖音 视频绝对路径 | 标题 只准备私密作品，真实上传/发布在控制台核对后操作。

机器人模型通过受保护本机代理调用现有 DSH 模型路由；不复制 API Key。临时推理会话完成后归档。
自主观看需要支持图片的模型；仅抽样画面，不代表看完或听完整视频。
抖音页可从现有路由独立选择模型，不改QQ全局模型。自主观看/视频任务需先通过合成红色图片识别测试；
当前deepseek-account/deepseek-flash两次把红图识别成白色，不能报告视觉实测通过；
openai-codex路由只有目录但未配置，pro拒绝图片。需要用户添加可用视觉模型，不能伪造配置成功。
测试图由本地代码生成，未读取真实桌面。文字模型的真实短JSON回复已通过。
人格首次复制机器人当前角色卡，可在抖音页修改或重新同步。兴趣记忆仅在本地抖音目录积累，
不会反向覆盖 QQ 人格、B站记忆或已删除桌宠。

数据/登录态：companion/douyin-data，ACL 收紧，禁止进入迁移包或公开仓库。
浏览器：独立 Edge profile，CDP 9238，不复用个人 Edge 或其他服务的登录目录。
上游两处适配：runtime-paths.mjs 增加机器人专用浏览器目录，core.mjs 增加专用调试端口环境变量。
没有启动原版桌面应用、向 DSH 注册原插件或重新启用已删除桌宠。

首次需本人扫码登录，验证码由本人完成。观看、公开评论、好友互动与分享独立设置。
发布先检查文件/标题/可见范围及 SHA256，上传与最终发布均从原始管理员操作进入。
发布不确定时标记待核对，不自动重试。使用已有本地视频，不包含视频生成器。
发布器的published只表示已点击发布，集成记录为submitted，最终结果要在作品管理核对，不声称平台确认成功。
部署只验证隔离传输、文件/权限/UI与实际模型连接，未登录抖音、未真实评论/私信/上传/发布。

重新安装依赖：在 integrations/douyin-agent-upstream 执行 npm ci --ignore-scripts --omit=dev --legacy-peer-deps。
无需安装 DSH 插件。现有换机 ZIP 尚未包含此集成，不能宣称换机包已更新。
# 原版完整界面（2026-10-25 后续）

机器人侧边栏“抖音助手”现在使用 LockyBee 原版完整 React 界面，保留七个设置分类、
对话任务、观看记录、记忆检索、兴趣与人格、互动回执、日报、自检与修复。
复用固定版本官方 UI primitives，但不启动/注册 DSH 插件。原版 UI 的独立 Key 对话框替换成
机器人模型选择与视觉测试，API 密钥与账号仍在 QQ Bridge“模型与账号”统一配置。

`douyin-standalone/build-ui.mjs` 在构建时适配上游，原版 UI 源文件保持原样。
官方组件固定提交 `fb2c4b9e698e30edb738bca4cf0618587db7d203` 通过上游 acquire-upstream 脚本
校验档案及完整源码树哈希。颜色直接来自 console.html，并在 iframe 内实时同步父页面主题与
CSS 变量；切换主题不重载，不丢草稿。构建产物保留 MIT、依赖通知与 KaTeX 字体 OFL 声明。

发布项目原本没有独立 Web UI，机器人新增“作品发布”页，将其已有参数接到原始 pipeline：
抖音/B站、标题/文案/话题、可见范围、封面帧、本地配乐与音量、平台曲库搜索、等待时间和注入上限。
平台曲库选曲会在浏览器停手；手动选曲后在当前创作者页发布。后台重新调用完整发布链会重载素材，
因此此类作品的后台确认按钮禁用，界面说明了原因。所有回执可展开查看。

`bin/ffmpeg.exe` 配合固定 npm 包 `@ffprobe-installer/win32-x64@5.1.0` 提供实际视频检查与混音。
FFprobe 包声明 GPL-3.0、二进制来自 Gyan，保留 npm 包元数据与 README，构建声明另存 notices。
生成的混音视频保存在排除打包的 companion/douyin-data/publish-media。原视频不修改。

构建：先按 `douyin-agent-upstream/desktop/scripts/acquire-upstream.mjs` 获取校验源码，
在其 desktop/ui-api 运行 npm ci --ignore-scripts，在 douyin-standalone 运行 npm ci --ignore-scripts，
然后在机器人根目录运行 `node integrations/douyin-standalone/build-ui.mjs`。
构建器复用 bili-standalone 已有 esbuild；无需下载 Electron。

验证：`node scripts/test-douyin.mjs`、`node scripts/test-douyin-media.mjs`、
`node scripts/test-douyin-native-ui.mjs`（后者需要 PLAYWRIGHT_MODULE，读取运行服务的真实只读快照，
全部写操作在隔离 HTTP fixture 中执行）。实际 3100 后台可打开完整界面，未出现 JS 错误；
视觉模型仍需用户配置并通过测试、抖音账号需本人登录。没有用真实上传、公开评论或私信做测试。
换机 ZIP 没有更新。

