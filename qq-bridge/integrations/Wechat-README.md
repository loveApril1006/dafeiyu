# 小鸽子微信通道与二次开发

管理入口是机器人后台的“微信通道”，沿用后台主题，复用现有聊天模型与人格。支持个人微信好友和微信群的文字消息，默认关闭；图片、文件、语音尚未作为此通道能力开放。

## 配置与开关

本机微信4.1.15.56的可访问性检查没有读到聊天控件，因此新增“本机数据库＋OCR”接法，保留“界面控件”接法供其他客户端使用。无需手机ClawBot入口。

1. 在“接法与本机数据”选择接法，数据目录留空时自动发现；也可指定本机 `xwechat_files` 绝对路径。多个账号目录时必须明确选择一个账号。
2. 设置检查间隔（5～60秒）和本机缓存上限（64～2048MB，默认256MB），保存时保持关闭。
3. 填写唯一好友备注名或群名，最多8个会话。群列表格式为“群名 | 自己在该群的昵称”，默认仅被@时回复。
4. 点击“检查本机数据源”。数据库接法只检查目录和文件是否存在，不读取数据库内容，不提取密钥，也不解密。
5. 总开关开启后才启动驱动、读取密钥和本机库、验证名单。首次启动记录消息基线，历史消息不触发自动回复。自动回复另有独立开关。
6. 关闭总开关或点击停止，会中断本项目的监听、模型请求和发送任务，终止本项目自己的Python进程。启动初始化期间也可点击停止。关闭后保留配置和已有本机缓存，便于再次启用。

OCR发送需要登录电脑版微信、保持桌面可用，并让目标出现在最近会话列表。只接受唯一且完全匹配的标题；不模糊搜索，不强制修改微信UI树。输入框有草稿时拒绝覆盖，只执行一次发送，结果无法回读确认时标为“不确定”且不自动重发。发送会临时占用前台和文本剪贴板，结束后尽力恢复仍未被其他应用修改的剪贴板。

“数据源检查通过”只表示找到文件。密钥提取、解密及OCR收发仍受客户端版本和桌面状态影响；启动失败会将总开关退回关闭。当前尚未对本机账号执行密钥提取、聊天库解密或真实外发，不能将替身测试当作实际微信收发验收。

## 目录分层

| 文件 | 职责 |
|---|---|
| `src/wechat/core.js` | 独立开关、允许名单、@触发、额度、队列、历史、去重和发送状态 |
| `src/wechat/transport-settings.js` | 接法配置校验及只查看文件信息的数据目录发现 |
| `src/wechat/desktop-driver.js` | 独立运行环境选择、Python进程生命周期与JSON-lines请求 |
| `companion/wechat-db-worker.py` | 按需加载本机库读取器，OCR单次发送及结果核验 |
| `companion/wechat_db_support.py` | 分片连接管理、缓存上限、消息基线／确认、严格收件人匹配 |
| `companion/wechat-desktop-worker.py` | pyweixin窗口适配；核对目标、增量消息与发送回读 |
| `src/wechat/service.js` | 后台HTTP路由与现有DSH模型／人格连接 |
| `src/wechat/store.js` | 私有目录、原子JSON与错误脱敏 |
| `src/wechat/ilink.js` | 可选iLink协议参考实现，未作为当前个人微信通道启用 |
| `public/wechat.html` | 主题继承、开关、诊断、名单、额度及消息面板 |

替换底层时实现下面接口即可，聊天和后台逻辑无需重写：

```js
const driver = {
  status() { return { ready: true, driver: 'your-driver', owner: '', targets: [] }; },
  async open() {},
  async poll(cursor, signal) {
    return {
      messages: [{
        id: 'stable-platform-message-id', peer: 'stable-conversation-id',
        kind: 'private', mentioned: false, text: '文字',
        context: 'reply-context', attachments: []
      }],
      cursor: 'durable-next-cursor', delayMs: 5000
    };
  },
  async send({ peer, context, item, clientId }, signal) {},
  async download(item, signal) {},
  async stop() {},
  async close() {}
};
```

`poll`必须可中断，并在收到下一次请求的已落盘cursor前重放未确认批次；不能在业务层接收前就丢掉消息。消息ID必须稳定。`send`只执行一次，并核对实际发送结果；结果未知应失败，不能在底层静默换ID重发。新适配器的额外能力要同步更新service的capabilities和前端。

## 资源与数据

关闭时不驻留Python、不查询聊天、不调用模型；手动点击数据源检查只短暂运行文件信息检查进程。开启后一个本机Python进程，数据库与OCR请求串行。按配置间隔查询指定会话的新消息，分片读取后关闭全部SQLite连接；不启动上游常驻多线程监听器。待处理队列最多16条，模型并发为1。全局微信模型额度默认30次／北京时间日，失败与取消也计尝试。历史最多8轮且受6000字符预算限制，设0则不携带历史。上下文按会话隔离，使用既有无工具预设和当前人格、模型。

`companion/wechat-data`保存私有配置、名单、收件箱与上下文，使用既有ACL收紧实现。数据库接法的密钥与解密缓存位于其 `database-cache/<账号路径哈希>/` 子目录，不返回给前端。源微信数据库只读，不做修改。解密以数据库分片为单位，缓存可能包含该分片的历史消息；模型只接收名单中符合触发条件的新文字及有界会话上下文。缓存上限同时检查源库体积、WAL和实际缓存；达到上限拒绝继续读取。

消息日志最多100条、去重ID最多2000个。发送前落盘 `sending`；重启时 `sending` 变为 `uncertain`，`running` 变为 `interrupted`，均不自动重试。收件箱持久化成功后才确认游标，避免未保存就丢消息。

数据库运行环境在 `integrations/wechat-db-runtime`，由 `scripts/prepare-wechat-db.py` 安装。源自 [jiatj/wechatapi](https://github.com/jiatj/wechatapi)，固定提交 `04ef8cbde3862cff90b5f6b42c9ebfcea44ef48d`，Apache-2.0；原始源码及LICENSE保留在 `integrations/wechatapi-upstream`。没有直接采用上游的UI树热激活、模糊收件人匹配和带重试的发送入口。

界面控件运行环境在 `integrations/wechat-desktop-runtime`，通过 `scripts/prepare-wechat-desktop.py` 创建。两种接法都使用独立venv，不修改GPT-SoVITS依赖或模型。原版pywechat源码固定提交 `8589baa049bb91d3a500602c167f07b2f8397a13`，保留其原始LICENSE及源码。它的LICENSE正文为LGPL-2.1，项目元数据有LGPLv3分类差异，因此保留上游声明原样，不替其重新标注。

iLink协议参考来源：[Tencent/openclaw-weixin](https://github.com/Tencent/openclaw-weixin)，MIT，固定提交 `874637a0dbc24050f72d1385add4fc6170a2d726`。原始许可证位于 `integrations/weixin-upstream/LICENSE`，本项目协议文件注明了来源。iLink目前与用户期望的普通微信好友／群模式分开管理，尚未开放账号不可通过本项目绕过。

## 验证

- `npm run test:wechat`：核心状态机、驱动配置与启动／停止、启动过程中关闭、真实桥接HTTP认证；模型与微信均为替身。
- `npm run test:wechat-ui`：真实浏览器检查接法配置、拒绝未就绪启动、名单、额度、诊断、开关、手机布局。
- `python scripts/test-wechat-db.py`：假数据库／GUI及临时SQLite分片，验证只查文件信息、账号重名拒绝、消息基线、cursor确认、分片聚合、连接关闭、内容长度、草稿保护及单次发送；不提取密钥、不操作本机微信。
- `python scripts/test-wechat-worker.py`：真实Python驱动逻辑配合假窗口，检查基线、cursor确认、收件人、发送回读和草稿保护，不操作本机微信。

后台接口均复用现有控制台认证与Host／Origin校验，拒绝agent管理请求。主要接口为 `/api/wechat/status`、`config`、`transport`、`targets`、`diagnose`、`send`、`stop`、`reset`。修改配置需带当前 `revision`；修改接法与名单需先关闭。`transport` 接收 `{revision, transport:{mode:'dbocr',dataRoot:'',account:'',pollSeconds:5,maxCacheMB:256}}`，不接受浏览器提交密钥。
