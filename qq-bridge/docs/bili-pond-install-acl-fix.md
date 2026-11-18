# Windows 安装后鱼塘不可用：数据目录 ACL

管理员安装后，目录可能属于 Administrators，而同一用户的普通 UAC 令牌没有 WRITE_DAC。旧版在鱼塘初始化时抛出异常，导致生活服务没有注册鱼塘路由，后台请求返回 503。

本次修改：

- `src/state-acl.mjs`：64MB 输出缓冲，不再使用 `/T`、`/C`；逐个普通文件/目录处理，跳过 junction/symlink，拒绝以链接为处理根目录。先授予当前账号 SID 权限，再移除继承和宽松授权。检查退出状态，并以 Windows ACL 对象及 SID 回读复核，不依赖中英文输出。
- `companion/bilibili-native.mjs`：ACL 失败记录原因和隐私风险，继续初始化。此降级不代表权限已保护；实际文件访问错误仍会正常报错。
- 安装与更新配置结束时，为 state 和鱼塘、抖音、直播、创作数据目录设置当前账号的显式权限，普通 UAC 令牌可继续使用，不依赖目录属主是否为 Administrators。
- 连接失败文案提示检查 `companion-error.log`，不再仅要求点击一键启动。

## 已安装客户

不要直接复制替换运行中的 `state/`，其中 SQLite 的 WAL/SHM 可能仍在使用。先备份并停止相关服务，再用客户实际运行账号的管理员终端调用：

```powershell
node .\scripts\harden-state-acl.mjs --directory .\state --elevated
node .\scripts\harden-state-acl.mjs --directory .\companion\bili-native-data --elevated
```

从 qq-bridge 目录执行；需要 node 可用。该显式维护命令失败返回非零，日常启动助手仍维持失败警告、不阻断启动。

若通过“使用其他用户身份”输入了另一个管理员账号，当前 SID 就是该管理员，而非客户运行账号；必须在客户实际运行账号下处理，不能将这类安装视为自动修复成功。

升级验收：检查日志是否还有启动失败、权限警告；在真实后台鉴权后确认 `/api/bili-pond/status`、`/api/bili-pond/model-account-state` 返回 200，且原有配置、记忆仍在。仅返回 200 不足以证明 ACL 已收紧，需同时检查访问与安全页。

本次不自动替换客户目录，不停止本机生产服务。代码修改需要进入新发行包后才会覆盖客户安装；既有安装器不会自动获得修复。
