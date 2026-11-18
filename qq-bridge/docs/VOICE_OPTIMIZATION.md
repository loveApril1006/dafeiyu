# 本地语音体积与内存优化（2026-10-27）

当前使用 GPT-SoVITS v2ProPlus，保留 RTX 5060 Ti 的 CUDA 加速与原来的半精度推理。4 个内置音色及其情绪参考音频不变，当前选中胡桃。没有替换模型、量化中文发音模型或调用付费语音接口。

## 已完成的改动

- 语音目录原逻辑体积约 8.2 GiB，其中运行环境约 6.2 GiB；4 个音色参考文件合计仅 2.7 MiB。
- 将 8,790 个 PyTorch C++ 扩展开发文件（约 864 MiB）收纳到经过逐文件 SHA-256 校验的独立压缩包（约 120 MiB），再移除原文件。推理 DLL、模型和第三方许可证保留。
- 对 82 个运行库／模型文件使用 Windows 的传统 NTFS 无损压缩，额外减少约 657 MiB。全部文件内容哈希保持一致；没有使用会添加 WOF 重解析点的 `/EXE` 压缩。
- 扣除开发文件备份后，合计减少 **1,468,915,022 字节，约 1.37 GiB** 的本机文件占用。音色和模型权重内容未变。
- HTTP 服务只保留轻量管理进程，首次合成时启动唯一模型进程。QQ 与桌宠共用；最多一个合成请求和一个等待请求，超出的请求直接返回繁忙，避免持续排队。
- 默认 **空闲 5 分钟释放模型进程**；后台「资源与开关 → 本地语音内存」可选择 1／5／10／30 分钟或保持常驻。首次说话和释放后的下一次说话需要重新加载。
- 正常关闭、模型错误／崩溃、后台意外退出均会回收模型进程；下次合成可重新加载。

## 本机实测

| 项目 | 结果 |
| --- | --- |
| 空闲／模型释放后的服务工作集 | 约 24 MiB |
| 合成工作时模型进程工作集 | 约 4.1 GiB，仍需模型正常推理内存 |
| 冷启动并生成一条短句 | 19.47 秒 |
| 同一模型连续生成短句 | 1.12 秒 |
| 实际空闲释放 | 临时设为 60 秒，确认模型进程退出，随后恢复 300 秒 |
| 音频验证 | 胡桃两种情绪短句均返回有效 WAV，FFmpeg 完整解码 |

计时为这台电脑上的短句测试，不代表所有文本的耗时。连续聊天重视响应速度时，可选「保持常驻」。这些操作不消耗聊天模型 token。

基础回归 35/35 脚本通过；另完成生命周期 6 项、开发文件安全／打包排除 5 项、语音接口与后台桌面／手机布局检查。原合成函数的 AST 与优化前一致；模型及运行文件压缩前后哈希一致。验证没有向 QQ、微信或空间发送内容。

完整记录：`state/voice-audit/summary.json`、`live-result.json`；开发文件备份：`maintenance/voice-storage-20261027/pytorch-development-sdk.zip`。

## 恢复与二次开发

普通 Python／JavaScript 二次开发不需要恢复 C++ 开发库。需要编译自定义 PyTorch／CUDA 扩展时，可恢复头文件、静态库和 CMake 文件；工具先验证备份，遇到已修改的文件会停止，避免覆盖：

```powershell
Set-Location qq-bridge
& ../GPT-SoVITS/runtime/python.exe scripts/optimize-voice-storage.py --action restore-sdk --apply --archive maintenance/voice-storage-20261027/pytorch-development-sdk.zip
```

取消 NTFS 压缩可将动作改为 `--action decompress`；无损压缩／解压不改变模型内容。少数被当前 Python 进程占用的 DLL 须在语音服务停止后用另一 Python 环境执行，或通过 Windows `compact /U` 处理。恢复文件和取消压缩会重新占用磁盘。

## 打包行为

当前公开默认设置已加入 300 秒空闲释放。后续构建会一起收集主服务与 3 个工作进程模块，并从推理安装内容中排除上述开发文件；DLL 与模型继续保留。既有目标目录中的开发文件不会被差异更新擅自删除。

**已发布 v22 ZIP 保持原样，大小仍约 8.73 GiB。** NTFS 压缩节省的是安装后的磁盘占用，解压 ZIP 时不会自动继承文件系统压缩。后续发布应使用新版本号，保留可选开发文件备份；安装后可运行收纳／压缩工具。当前没有再生成一份大型完整安装包。

技术依据：[Microsoft compact 文档](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/compact)、[PyTorch C++ 扩展文档](https://docs.pytorch.org/docs/stable/cpp_extension.html)。
