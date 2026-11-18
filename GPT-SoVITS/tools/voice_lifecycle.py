"""Bounded worker lifecycle: lazy load, idle release and crash recovery."""
import multiprocessing
import os
import queue
import threading
import time
from tools.voice_worker import run_worker


def _worker_entry(target, requests, responses):
    # Also release GPU memory if the HTTP host is killed outside our shutdown API.
    parent = multiprocessing.parent_process()
    def watch_parent():
        while parent and parent.is_alive():
            time.sleep(.5)
        if parent:
            os._exit(0)
    threading.Thread(target=watch_parent, daemon=True).start()
    target(requests, responses)


class VoiceBusy(RuntimeError):
    pass


class VoiceUnavailable(RuntimeError):
    pass


class VoiceRuntime:
    def __init__(self, idle_seconds=300, worker_target=run_worker, timeout=120):
        self.idle_seconds = idle_seconds
        self.worker_target, self.timeout = worker_target, timeout
        self.lock = threading.Lock()
        self.waiters = threading.BoundedSemaphore(2)
        self.stop_event = threading.Event()
        self.context = multiprocessing.get_context('spawn')
        self.process = self.requests = self.responses = None
        self.last_used = time.monotonic()
        self.state = 'unloaded'
        self.info = {'compute': 'pending', 'device': '按需加载（GPU 优先）'}
        self.reaper = threading.Thread(target=self._idle_loop, daemon=True)
        self.reaper.start()

    def status(self):
        process = self.process
        try:
            alive = bool(process and process.is_alive())
            pid = process.pid if alive else None
        except (ValueError, OSError):
            alive, pid = False, None
        return {**self.info, 'modelState': self.state,
                'modelLoaded': alive and self.state in ('ready', 'busy'),
                'workerPid': pid,
                'idleUnloadSeconds': self.idle_seconds}

    def configure(self, seconds):
        self.idle_seconds = seconds
        self.last_used = time.monotonic()

    def _receive(self, timeout):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            try:
                return self.responses.get(timeout=min(.2, max(.001, until - time.monotonic())))
            except queue.Empty:
                if not self.process or not self.process.is_alive():
                    raise VoiceUnavailable('Voice worker exited; retry to reload')
        raise VoiceUnavailable('Voice worker timed out')

    def _dispose_locked(self):
        process = self.process
        if process:
            if process.is_alive():
                try:
                    self.requests.put_nowait(None)
                except queue.Full:
                    pass
                process.join(timeout=2)
                if process.is_alive():
                    # Only our own worker is stopped, after synthesis or failure.
                    process.terminate()
                    process.join(timeout=3)
            if process.is_alive():
                raise VoiceUnavailable('Voice worker has not stopped')
            process.close()
        for channel in (self.requests, self.responses):
            if channel:
                channel.cancel_join_thread()
                channel.close()
        self.process = self.requests = self.responses = None
        self.state = 'unloaded'

    def _start_locked(self):
        if self.process and self.process.is_alive() and self.state == 'ready':
            return
        self._dispose_locked()
        self.requests, self.responses = self.context.Queue(1), self.context.Queue(1)
        self.process = self.context.Process(target=_worker_entry,
                                            args=(self.worker_target, self.requests, self.responses), daemon=True)
        self.state = 'loading'
        self.process.start()
        kind, data = self._receive(self.timeout)
        if kind != 'ready':
            raise VoiceUnavailable(str(data))
        self.info = data
        self.state = 'ready'

    def synthesize(self, **request):
        if self.stop_event.is_set():
            raise VoiceUnavailable('Voice service is stopping')
        if not self.waiters.acquire(blocking=False):
            raise VoiceBusy('语音合成繁忙，请稍后重试')
        acquired = False
        try:
            acquired = self.lock.acquire(timeout=10)
            if not acquired:
                raise VoiceBusy('语音合成繁忙，请稍后重试')
            if self.stop_event.is_set():
                raise VoiceUnavailable('Voice service is stopping')
            self._start_locked()
            self.state = 'busy'
            self.requests.put(request, timeout=1)
            kind, data = self._receive(self.timeout)
            if kind != 'audio':
                raise VoiceUnavailable(str(data))
            self.last_used = time.monotonic()
            self.state = 'ready'
            return data
        except VoiceUnavailable:
            if acquired:
                self._dispose_locked()
            raise
        except VoiceBusy:
            raise
        except Exception as error:
            if acquired:
                self._dispose_locked()
            raise VoiceUnavailable('Voice worker could not complete the request') from error
        finally:
            if acquired:
                self.lock.release()
            self.waiters.release()

    def release_if_idle(self):
        if not self.lock.acquire(blocking=False):
            return False
        try:
            if (self.process and self.idle_seconds > 0 and
                    time.monotonic() - self.last_used >= self.idle_seconds):
                self._dispose_locked()
                return True
            return False
        finally:
            self.lock.release()

    def _idle_loop(self):
        while not self.stop_event.wait(1):
            self.release_if_idle()

    def close(self):
        self.stop_event.set()
        self.reaper.join(timeout=2)
        with self.lock:
            self._dispose_locked()
