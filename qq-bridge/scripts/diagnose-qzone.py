"""Read-only customer diagnosis. Never publishes, uploads, or exports cookies/feed content."""
from pathlib import Path
from datetime import datetime, timezone, timedelta
import contextlib
import importlib
import io
import json
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SPACE_URL = 'https://user.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def read_response(request, local=False):
    handlers = [NoRedirect()]
    if local:
        handlers.append(urllib.request.ProxyHandler({}))
    with urllib.request.build_opener(*handlers).open(request, timeout=12) as response:
        raw = response.read(1024 * 1024 + 1)
    if len(raw) > 1024 * 1024:
        raise ValueError('ResponseTooLarge')
    return raw.decode('utf-8-sig', errors='replace')


def safe_code(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and abs(value) < 1000000000:
        return value
    if isinstance(value, str) and re.fullmatch(r'-?\d{1,8}', value):
        return int(value)
    return None


def network_hint(error, local):
    if isinstance(error, urllib.error.HTTPError):
        code = error.code
        if code in (401, 403) and local:
            return f'HTTP {code}：QQ 网关令牌无效或没有接口权限，请核对 SnowLuma 连接设置。'
        if code in (301, 302, 303, 307, 308) and not local:
            return '空间请求被重定向，可能需要重新登录空间；未跟随重定向。'
        if local and code in (404, 426):
            return f'HTTP {code}：可能填错 OneBot HTTP 端口，5099 管理页和 WebSocket 端口不能替代 HTTP 接口。'
        return f'HTTP {code}：对应服务未接受检查请求。'
    reason = getattr(error, 'reason', error)
    code = getattr(reason, 'winerror', None) or getattr(reason, 'errno', None)
    if isinstance(reason, ConnectionRefusedError) or code in (61, 111, 10061):
        return '连接被拒绝：请在 SnowLuma 登录 QQ，并确认已启用 OneBot HTTP 服务。' if local else '空间服务器连接被拒绝，请检查客户电脑网络。'
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return 'QQ 网关请求超时，请检查 SnowLuma 是否卡住。' if local else '空间请求超时，请检查客户电脑访问 QQ 空间的网络。'
    if isinstance(reason, socket.gaierror):
        return '地址解析失败，请检查 DNS 或服务地址。'
    return '请求未完成（' + type(error).__name__ + '），请结合该步骤排查；未输出原始异常以避免泄露凭据。'


def check_sdk(root):
    source = root / 'integrations/qzone-sdk-upstream/src'
    sys.path.insert(0, str(source))
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        module = importlib.import_module('qzone_sdk')
        assert hasattr(module, 'QZoneClient') and hasattr(module, 'ManualCookieProvider')
        importlib.import_module('qzone_sdk.utils.jsonp')


def diagnose(root=ROOT, request_fn=read_response, sdk_check=check_sdk):
    rows = []
    def add(name, ok, detail):
        rows.append({'step': name, 'ok': ok, 'detail': detail})
    try:
        cfg = json.loads((root / 'config.json').read_text(encoding='utf-8-sig'))
        snow = cfg['snowluma']
        base = snow['httpUrl'].rstrip('/')
        parsed = urllib.parse.urlsplit(base)
        if parsed.scheme not in ('http', 'https') or parsed.hostname not in ('localhost', '127.0.0.1', '::1') or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('InvalidLocalAddress')
        token = snow.get('accessToken', '')
        if not isinstance(token, str):
            raise ValueError('InvalidTokenType')
        add('配置读取', True, '已读取本机 OneBot HTTP 设置；不输出地址中的凭据或令牌。')
    except Exception:
        add('配置读取', False, '无法读取 QQ Bridge 配置，或 OneBot HTTP 地址不是有效的本机地址；请核对安装目录和连接设置。')
        return rows
    for name, relative in [('空间发布脚本', 'companion/qzone-autopost.py'), ('空间 SDK 文件', 'integrations/qzone-sdk-upstream/src/qzone_sdk/__init__.py')]:
        exists = (root / relative).is_file()
        add(name, exists, '文件存在。' if exists else '文件缺失，请修复完整安装包中的空间组件。')
    try:
        sdk_check(root)
        add('空间 SDK 加载', True, '当前 Python 能加载发布组件。')
    except Exception as error:
        missing = getattr(error, 'name', '')
        module = '，缺少模块 ' + missing if isinstance(missing, str) and re.fullmatch(r'[A-Za-z_][A-Za-z_0-9.]{0,80}', missing) else ''
        add('空间 SDK 加载', False, type(error).__name__ + module + '；请修复 Python 运行环境或空间 SDK。')
    def onebot(action, body):
        assert action in ('get_login_info', 'get_cookies')
        request = urllib.request.Request(base + '/' + action, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token}, method='POST')
        value = json.loads(request_fn(request, True))
        if not isinstance(value, dict):
            raise ValueError('InvalidReply')
        code = safe_code(value.get('retcode', 0))
        if value.get('status') == 'failed' or code != 0:
            raise RuntimeError('OneBotRejected:' + str(code))
        return value.get('data')
    try:
        info = onebot('get_login_info', {})
        uin = str(info['user_id'])
        if not re.fullmatch(r'[1-9]\d{4,15}', uin):
            raise ValueError('MissingUserId')
        add('QQ 网关与账号', True, 'QQ 网关可访问，已取到登录账号；不记录 QQ 号。')
    except Exception as error:
        detail = '网关没有返回有效的登录账号；请在 SnowLuma 重新登录 QQ。' if isinstance(error, (ValueError, TypeError, KeyError, RuntimeError)) else network_hint(error, True)
        add('QQ 网关与账号', False, detail)
        return rows
    try:
        data = onebot('get_cookies', {'domain': 'qzone.qq.com'})
        cookie = data.get('cookies', '') if isinstance(data, dict) else ''
        if not isinstance(cookie, str):
            raise ValueError('InvalidCookieReply')
        jar = dict(part.strip().split('=', 1) for part in cookie.split(';') if '=' in part)
        key = jar.get('p_skey') or jar.get('skey')
        if not key:
            add('空间凭据读取', False, '没有取到空间凭据。请在机器人登录的 QQ 客户端打开自己的空间，再运行本工具。')
            return rows
        jar.setdefault('p_uin', jar.get('uin', 'o' + uin))
        add('空间凭据读取', bool(jar.get('p_skey')), '已取到 p_skey；凭据只在内存中使用。' if jar.get('p_skey') else '只取到 skey，发布组件可能需要 p_skey；请先在 QQ 客户端打开自己的空间。')
    except Exception as error:
        detail = 'QQ 网关未返回有效的空间凭据，请检查 SnowLuma 是否支持 get_cookies。' if isinstance(error, (ValueError, TypeError, KeyError, RuntimeError)) else network_hint(error, True)
        add('空间凭据读取', False, detail)
        return rows
    try:
        bkn = 5381
        for character in key:
            bkn = ((bkn << 5) + bkn + ord(character)) & 0xffffffff
        params = {'uin': uin, 'ftype': '0', 'sort': '0', 'pos': '0', 'num': '1', 'g_tk': str(bkn & 2147483647), 'code_version': '1', 'format': 'json'}
        request = urllib.request.Request(SPACE_URL + '?' + urllib.parse.urlencode(params), headers={'Cookie': '; '.join(k + '=' + v for k, v in jar.items()), 'Referer': 'https://user.qzone.qq.com/' + uin, 'User-Agent': 'Mozilla/5.0'}, method='GET')
        text = request_fn(request, False)
        start, end = text.find('{'), text.rfind('}')
        if start < 0 or end < start:
            raise ValueError('NotJson')
        value = json.loads(text[start:end + 1])
        if not isinstance(value, dict):
            raise ValueError('InvalidReply')
        codes = [safe_code(value[k]) for k in ('code', 'ret', 'subcode') if k in value]
        failures = [code for code in codes if code not in (None, 0)]
        if failures:
            code = failures[0]
            hint = '空间登录态已失效，请在 QQ 客户端打开自己的空间并完成登录后重试。' if code in (-3000, -10001) else '空间服务拒绝读取，请检查账号空间状态或访问限制。'
            add('空间只读验证', False, '返回码 ' + str(code) + '；' + hint)
        elif codes and 0 in codes and isinstance(value.get('msglist'), list):
            add('空间只读验证', True, '空间接受当前凭据，读取接口正常；不保存任何说说内容。')
        else:
            add('空间只读验证', False, '返回内容不是预期的空间列表，可能需要重新登录；未保存原始响应。')
    except Exception as error:
        detail = '空间返回了无法识别的内容，请先在 QQ 客户端打开自己的空间。' if isinstance(error, (ValueError, TypeError, KeyError)) else network_hint(error, False)
        add('空间只读验证', False, detail)
    return rows


def render(rows):
    stamp = datetime.now(timezone(timedelta(hours=8))).strftime('%Y-%m-%d %H:%M:%S UTC+8')
    lines = ['小鸽子 QQ 空间诊断（只检查，不发布、不上传、不启停服务）', stamp, 'Python：' + sys.version.split()[0]]
    for row in rows:
        lines.append(('通过' if row['ok'] else '未通过') + ' | ' + row['step'] + '：' + row['detail'])
    lines.extend(['', '本次没有发布说说、上传配图、修改配置或调用收费模型。', '报告不包含 API 密钥、Cookie、QQ 号、聊天记录或说说内容。', '读取正常不等于发布权限一定正常；若全部通过但仍发布失败，需继续检查失败当时的发布日志。'])
    return '\n'.join(lines) + '\n'


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    report = render(diagnose())
    folder = ROOT / 'state'
    folder.mkdir(exist_ok=True)
    (folder / 'qzone-diagnostic.txt').write_text(report, encoding='utf-8-sig')
    print(report)
