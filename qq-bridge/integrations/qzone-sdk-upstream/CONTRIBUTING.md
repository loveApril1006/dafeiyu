# 贡献指南

感谢你对 qzone-sdk 的关注！

## 如何贡献

### 报 Bug

在 [Issues](https://github.com/Eganchiyu/qzone-sdk/issues) 中提交，包含：

- Python 版本
- 操作系统
- 复现步骤
- 错误日志

### 提功能

先开 Issue 讨论，确认后再提 PR。

### 提 PR

1. Fork 本仓库
2. 创建分支：`git checkout -b feature/xxx`
3. 提交：`git commit -m "feat: add xxx"`
4. 推送：`git push origin feature/xxx`
5. 开 Pull Request

### Commit 规范

使用 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```
feat: 新功能
fix: 修复
docs: 文档
refactor: 重构
test: 测试
chore: 杂项
```

### 代码风格

- 遵循 PEP 8
- 类型注解
- 异步函数以 `async def` 定义
- 保持零第三方依赖（标准库优先）

### 测试

提交代码前请运行测试：

```bash
pip install -e ".[dev]"
python -m pytest
```

- 测试位于 `tests/`，覆盖哈希算法、JSONP/说说解析、认证与 CLI 等纯逻辑
- 涉及真实 QQ 接口的改动请注明手工验证方式（扫码登录后可执行 `qzone publish` 冒烟测试）

### 项目结构

```
src/qzone_sdk/
├── client.py      # QZoneClient 核心操作（接口参数构建）
├── config.py      # QZoneConfig
├── constants.py   # 接口地址与常量
├── errors.py      # 异常体系
├── auth/          # 认证提供者（扫码 / NapCat / Cookie）
├── utils/         # HTTP 与解析等纯函数工具
└── cli.py         # qzone 命令行（argparse）
```
