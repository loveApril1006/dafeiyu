"""Lightweight loopback host with an idle-releasable GPT-SoVITS worker."""
import faulthandler
import hmac
import json
import os
from pathlib import Path
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from tools.voice_lifecycle import VoiceBusy, VoiceRuntime, VoiceUnavailable

CONFIG = ROOT / 'pet-voice.json'
CONFIG_LOCK = threading.Lock()
RUNTIME = None
IDLE_CHOICES = (0, 60, 300, 600, 1800)


def settings():
    return json.loads(CONFIG.read_text(encoding='utf-8-sig'))


def idle_setting(cfg):
    seconds = cfg.get('performance', {}).get('idleUnloadSeconds', 300)
    return seconds if type(seconds) is int and seconds in IDLE_CHOICES else 300


def save_setting(update):
    with CONFIG_LOCK:
        cfg = settings()
        update(cfg)
        temporary = CONFIG.with_suffix('.tmp')
        temporary.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(temporary, CONFIG)


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, data, mime='application/json; charset=utf-8'):
        if not isinstance(data, bytes):
            data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        cfg = settings()
        if self.path == '/health':
            self.reply(200, {'ok': True, 'engine': 'gpt-sovits', 'version': 'v2ProPlus',
                             **RUNTIME.status(), 'voice': cfg['voice'],
                             'name': cfg['voices'][cfg['voice']]['name']})
        elif self.path == '/voices':
            self.reply(200, {'selected': cfg['voice'],
                             'voices': {k: v['name'] for k, v in cfg['voices'].items()}})
        elif self.path == '/performance':
            self.reply(200, {'ok': True, **RUNTIME.status()})
        else:
            self.reply(404, {'error': 'Not found'})

    def do_POST(self):
        if self.headers.get('Origin'):
            self.reply(403, {'error': 'Browser requests disabled'})
            return
        if self.path == '/shutdown':
            try:
                token = (ROOT / 'service-token').read_text(encoding='utf-8').strip()
            except OSError:
                token = ''
            if not token or not hmac.compare_digest(token, self.headers.get('x-service-token', '')):
                self.reply(403, {'error': 'Unauthorized'})
                return
            self.reply(200, {'ok': True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16384:
                raise ValueError('Invalid request size')
            self.connection.settimeout(15)
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError('Expected an object')
            if self.path == '/voice':
                key = body.get('voice')
                if not isinstance(key, str) or key not in settings()['voices']:
                    raise ValueError('Unknown voice')
                save_setting(lambda cfg: cfg.update(voice=key))
                self.reply(200, {'ok': True, 'voice': key})
                return
            if self.path == '/performance':
                seconds = body.get('idleUnloadSeconds')
                if type(seconds) is not int or seconds not in IDLE_CHOICES:
                    raise ValueError('Idle timeout must be 0/60/300/600/1800 seconds')
                save_setting(lambda cfg: cfg.update(performance={'idleUnloadSeconds': seconds}))
                RUNTIME.configure(seconds)
                self.reply(200, {'ok': True, **RUNTIME.status()})
                return
            if self.path != '/synthesize':
                self.reply(404, {'error': 'Not found'})
                return
            text = str(body.get('text', '')).strip()
            voice, emotion = body.get('voice'), body.get('emotion')
            if not 0 < len(text) <= 500:
                raise ValueError('Text must be 1-500 characters')
            if voice is not None and (not isinstance(voice, str) or voice not in settings()['voices']):
                raise ValueError('Unknown voice')
            if emotion is not None and not isinstance(emotion, str):
                raise ValueError('Invalid emotion')
            self.reply(200, RUNTIME.synthesize(text=text, voice=voice, emotion=emotion), 'audio/wav')
        except (ValueError, TypeError) as error:
            self.reply(400, {'error': str(error)})
        except VoiceBusy as error:
            self.reply(429, {'error': str(error)})
        except VoiceUnavailable:
            self.reply(503, {'error': '语音模型未就绪，请稍后重试；将自动重新加载'})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            self.reply(500, {'error': 'GPT-SoVITS synthesis failed; see pet-service-error.log'})


if __name__ == '__main__':
    faulthandler.enable()
    RUNTIME = VoiceRuntime(idle_seconds=idle_setting(settings()))
    port = int(os.environ.get('PETVOICE_PORT', '17866'))
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print(f'READY GPT-SoVITS pet voice http://127.0.0.1:{port} (lazy load)', flush=True)
    try:
        server.serve_forever()
    finally:
        RUNTIME.close()
        server.server_close()
        print('GPT-SoVITS stopped; voice worker unloaded.', flush=True)
