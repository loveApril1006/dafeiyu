# 按需启用的记忆、上下文、视觉与搜索

2026-10-25 已在本机 desktop profile 安装，四项最终均关闭。入口为机器人3100后台的「插件管理」，置顶卡片跟随现有后台主题。

| 功能 | 上游 | 已安装版本 |
|---|---|---|
| 长期记忆 | [omdsh-dev/dsh-mnemon](https://github.com/omdsh-dev/dsh-mnemon) | 0.5.34 |
| 上下文/用量 | [bowenliang123/dsh-context](https://github.com/bowenliang123/dsh-context) | 0.76.0 |
| 视觉识图 | [ysr666/dsh-vision-router](https://github.com/ysr666/dsh-vision-router) | 3.1.0 |
| 联网搜索 | [liustack/modsearch](https://github.com/liustack/modsearch) | 5.10.10 |

卡片使用真实 pluginManager 清单与启停 RPC，不是独立模拟开关。关闭整个插件包会取消 bundle 选择，卸载钩子、工具与定时工作，不删除记忆。已发出的请求、当前回合的历史内容和 token 不能撤回。单组件开关属于高级管理，不等同于关闭整个包。

当前 DSH 0.2.1-rc.2 对这些第三方包返回 `restart-required / unmanaged-plugin`，即使组件已经 active 或已卸载。后台保留官方重启提示；不会把结果改成 applied。真实测试分别确认了 active 与停用后无 active 条目，不要求通过强制结束整个 DSH 来完成测试。

## 费用与范围

- Mnemon：workspace 存储、用户画像跟随存储；默认召回3条，MEMORY 4096字节、USER 1024字节。空闲审查、技能自进化、自动回测、Git同步关闭；手动写入触发容量归档/整理时仍可能调用模型，记忆投影也会占输入 token。第三方嵌入服务未配置；本地 CLI 无嵌入时的持久写入、关键词读取已验证。
- Context：展示会话上下文、缓存与用量，不额外调用模型，不承诺自动压缩。详细界面在DSH会话内；3100原有用量统计保留。
- Vision Router：快速模式，缓存开启，2MP缩图，每回合最多2次视觉调用，视觉总预算60秒；自动首轮bootstrap、后台benchmark、桌面截图关闭。按需图片理解仍使用预置云端视觉链，图片与问题会提交给视觉服务；不自动替换QQ当前所选模型。
- ModSearch：QQ原有安全搜索适配器读取desktop profile的bundle选择。启用后调用已安装包内固定CLI，关闭后恢复原有DeepSeek/Bing路径。结果最多5条，每条摘要500字符，缓存5分钟；开关变化不会复用另一提供方的缓存。新搜索失败明确返回失败，不暗中发起付费模型兜底。搜索免费额度和LLM的token用量是两回事。网页抓取继续走safe-fetch的公网地址检查。

QQ的新工作区由`src/qq-memory-scope.js`按群/私聊生成固定独立目录。sessionPolicy增加范围版本，旧共享cwd会话退役归档，原会话文件保留；新消息使用新工作区，不把旧共享记忆复制进去。原桥接social-v2状态保留。

QQ预设仍不允许shell、文件读写、插件管理或任意子任务。只增放两个按执行Agent工作区限定的记忆工具（runtime_memory、recall），以及只接受本会话sha256附件ID的vision_describe；本地图片路径、截图与其余视觉工具仍拒绝。非必要第三方工具从新QQ会话schema隐藏以减少工具描述开销。执行参数来自当前DSH工具服务冻结的arguments快照；附件归属由上游进一步检查。

## 文件与安装

- `scripts/install-optional-dsh.mjs`：通过DSH原生安装器安装固定版本，初始enabled:false，安装结果与profile备份在state/optional-plugin-backups。
- `scripts/configure-optional-dsh.mjs`：一次性追加完整配置行；标记存在时保留管理员后续修改，不覆盖模型路由和凭据。
- Mnemon CLI：本机`integrations/mnemon-runtime`安装`@mnemon-dev/mnemon@0.2.12`，配置指向其Windows原生exe，不依赖全局PATH。换机需要重新安装对应平台CLI并更新cliPath。
- `src/optional-dsh-features.js`：四项功能的初始设置说明；真实启用状态与phase来自DSH。
- `.dsh/profiles/desktop/cordis.patch.yml`：实际配置。记忆数据在各工作区`.mnemon`，QQ工作区位于state之内，不应打包。UI卡片描述的是本次初始策略，之后通过DSH修改高级设置时应同步说明。

本次未更新既有换机ZIP。B站鱼塘和抖音仍为机器人独立集成，没有向DSH注册这两个bundle。

## 验证

通过：`test-optional-dsh.mjs`、`test-optional-dsh-ui.mjs`、`test-plugin-manager.mjs`、`test-plugin-manager-ui.mjs`、`test-tool-restrict-guard.mjs`、`test-media-search.mjs`、`test-audit-bridge.mjs`与bridge语法检查。`test-preset-local-tools.mjs`以安装内的Electron Node与asar包目录运行，7项通过；当前未安装的plugin-guard三个工具归为可选工具，仍保留拒绝规则。

`check-optional-dsh-live.mjs`实际逐个启用/停用，检查记忆省耗配置、视觉本机设置接口的限制、ModSearch路由启用及关闭后的原搜索路由恢复。四项最后均关闭。`check-optional-qq-search-live.mjs`经3100真实开关，对公开GitHub主题搜索返回5条，再关闭并确认原搜索被选中。

3100实际鉴权页面已检查四张关闭卡片、手机宽度和无页面脚本错误。证据在state/optional-dsh-check。没有以真实QQ发送或上传个人图片作为测试；没有实测一整轮QQ模型对话中的记忆写入/视觉推理。
