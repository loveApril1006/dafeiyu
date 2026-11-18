# 安装默认与覆盖更新

商业发布前须阅读 `docs/微信商业使用审查-20261031.txt`，对最终待打包目录或安装包解包目录执行 `npm run check:wechat-commercial -- --staging <目录>`；非零退出码不得按商业包发布。此检查只是微信相关待审组件的保守排除检查，不授予商业许可，不替代整包代码、模型、素材和平台授权审查；也未自动接入全部历史打包脚本。现有完整版仍未获商业发布放行。

同图展开、聊天轨道与陨星版本（2026-10-30）须同时更新 `public/ocean-flow.js`、`public/ocean-scene.js`、`public/memory-context.html`、`src/console-assets.js`、`src/ocean-memory.js` 与 `src/bridge.js`；不能只替换网页或遗漏新增静态脚本。新版包含只读同图数据接口，不新增依赖或模型请求。来源与回执表、消息索引由新版模块增量建立，不替换现有数据库。回执属于用户运行数据，不进入安装默认模板；覆盖安装沿用下述记忆、人格、配置和媒体保留规则。第三方非商业参考页面不在本项目或安装分发中。

打包必须同步完整的新版程序及新增模块依赖，再重新生成清单；仅更新默认设置模板不能更新程序功能。识海联动目前额外依赖 `src/mnemon-link.js`，应随 `src/memory-context.js` 等新版文件一起分发。

`default-settings.json` 是新安装的功能默认快照。执行 `node scripts/export-packaging-defaults.mjs` 可从开发电脑重新采集允许分发的配置。导出仅更新此模板和审计记录，不改动当前机器设置；原配置、人格文件与凭据文件在采集前后校验一致。

快照包含聊天及发送策略、当前人格、情感表达与学习、识海自主活动预算、B站／抖音／直播／空间／创作开关、视频记忆整理策略、桌宠与语音，以及可选插件设置。只有白名单字段进入模板。新机器的账号、API 密钥、登录凭据、授权对象、直播房间与项目目录由新机器自己配置；聊天、人物关系、记忆内容、图片和运行记录不进入模板。原始图片、语音或模型文件不通过此设置导出器复制。

新安装通过 `release-profile.mjs` 的 `fresh:true` 应用快照。覆盖安装调用默认的 `fresh:false`，不会应用新的默认偏好。角色卡、聊天／记忆数据库、原配置、模型账号、用户图片、插件开关及 companion 根目录的设置文件保留；已删除的人格卡不会重新创建。用户关闭的可选插件不因补注册而重新开启。

`installer/` 保存后续安装包应采用的安装和更新脚本源文件。打包时将其放入安装包的 `工具/`，设置新版本号，并重新生成 payload 索引、安装工具哈希和 manifest；同时带上当前的 `release-profile.mjs`、`src/portable-settings.js`、`src/ocean-cognition.js` 和此默认模板。不能直接替换已经校验或发布的安装包内文件。

验证命令：`node --test scripts/test-portable-settings.mjs scripts/test-settings-install-integration.mjs scripts/test-install-preservation.mjs scripts/test-ocean-cognition-controls.mjs`。测试覆盖新安装、原设置保留、私有字段排除、重复更新、用户素材、取消／损坏／中断回滚。

跨功能识海还需同时分发 `src/activity-sources.js`、`src/activity-memory.js` 和关联的桥接、情感、创作、上下文及星图新版文件。安装默认只包含活动来源开关、情感影响和默认管理员范围，不包含经历、正文、媒体和来源账号。覆盖安装继续保留原数据库及用户设置，不重新导入开发机器的活动内容。

联想召回与连续状态版本还需包含 `src/ocean-retrieval.js`、`src/ocean-summary.js`、`src/ocean-continuity.js` 及配套的桥接/协调器和两个识海前端文件。新增证据卡、备忘录与接续笔记都属于用户数据库内容，不进入安装默认模板；覆盖安装保留它们。新版本无需安装额外记忆插件或在线嵌入模型。

三维鱼窝还需要包含 src/fish-home.js、src/fish-home-http.js、public/fish-home.html、public/fish-home.css、public/fish-home-ui.js、public/fish-home-scene.js 和 public/vendor/three/ 内固定版本模块及MIT许可。房间布局、日记和家园日志保存在用户数据库，不作为默认偏好分发。安装时不能只复制HTML而遗漏三维模块与静态路由接线。


桌宠鱼窝联动补充（2026-10-29）：发布需包含 src/fish-home-avatar.js、src/fish-home-runtime.js 和本次修改的鱼窝、记忆协调、活动来源、情感、桥接及网页文件。形象读取同一安装内现有 desktop-pet/dsh-pet/dsh-pet/assets/webm 或用户 engine-home/dsh-pet 动画覆盖目录，不把当前实例的桌宠配置/形象自定义覆盖给其他用户。覆盖安装继续保留人格、用户配置、主数据库、媒体和已有家具布置；鱼窝来源新默认通过代码补齐，不覆盖用户已关掉的来源。


鱼窝生活状态补充：发布包含 src/fish-home-vitals.js 及其对应鱼窝、形象、场景、协调器和界面变更。状态与信号索引在原 conversation-memory.sqlite 内，沿用覆盖安装的数据保留规则，不打入当前实例数值作为安装默认。新的睡眠姿态/呼吸/Zzz由代码实现，未改动或覆盖桌宠原动画包。


角色碰撞修正（2026-10-30）：发布必须包含 src/fish-home-space.js；该无状态几何文件也由固定 /fish-home-assets/fish-home-space.js 路径供网页加载。前后端必须一同更新 fish-home.js、fish-home-http.js、fish-home-scene.js 和 fish-home-ui.js。用户家具布置、状态和识海数据不覆盖。

肥鱼生活总部（2026-10-30）：部署需包含 src/fish-headquarters.js、src/fish-hq-layout.js、public/fish-hq.html、public/fish-hq.css、public/fish-hq-ui.js、public/fish-hq-scene.js，及本次桥接/协调器/静态路由/侧栏/鱼窝入口变更。总部使用原创几何鱼和家具，不加载原桌宠动画；从总部进入旧房间使用 character=original。覆盖安装保留原设置、人格、聊天记忆、媒体、房间布局与生活状态。商业发布的资源范围详见 docs/fish-life-headquarters.md；旧桌宠素材的禁止商用限制仍然适用。

生活总部工作台补充（2026-10-30）：需附带 src/fish-hq-runtime.js 及同步的总部网页、fish-headquarters.js、memory-context.js、bridge.js、fish-home.js 和 console/shell.js。进度来自本机任务记录及已初始化服务，日记/自动生活复用既有API；不覆盖用户设置、人格、聊天记忆、媒体或家具。
