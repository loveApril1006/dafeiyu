"""Exercise real Windows child lifetimes with a tiny fake inference engine."""
import concurrent.futures
import ctypes
import multiprocessing
import os
from pathlib import Path
import sys
import threading
import time
import unittest

sys.path.insert(0, str(Path(__file__).absolute().parents[2] / 'GPT-SoVITS'))
from tools.voice_lifecycle import VoiceBusy, VoiceRuntime, VoiceUnavailable


def fake_worker(requests, responses):
    responses.put(('ready', {'compute': 'test', 'device': 'test worker'}))
    while True:
        request = requests.get()
        if request is None:
            return
        if request['text'] == 'crash':
            os._exit(7)
        if request['text'] == 'error':
            responses.put(('error', 'fake error'))
            continue
        if request['text'] == 'slow':
            time.sleep(.5)
        responses.put(('audio', b'RIFF-fake-WAVE-' + str(os.getpid()).encode()))


def parent_exits_abruptly(connection):
    runtime = VoiceRuntime(worker_target=fake_worker, timeout=5)
    runtime.synthesize(text='orphan test')
    connection.send(runtime.status()['workerPid'])
    connection.recv()
    os._exit(0)


class VoiceLifecycleTest(unittest.TestCase):
    def runtime(self, idle=300):
        runtime = VoiceRuntime(idle_seconds=idle, worker_target=fake_worker, timeout=5)
        self.addCleanup(runtime.close)
        return runtime

    def test_lazy_reuse_idle_release_and_reload(self):
        runtime = self.runtime()
        self.assertEqual(runtime.status()['modelState'], 'unloaded')
        self.assertIsNone(runtime.process)
        self.assertTrue(runtime.synthesize(text='first').startswith(b'RIFF'))
        first = runtime.status()['workerPid']
        runtime.synthesize(text='second')
        self.assertEqual(runtime.status()['workerPid'], first)
        runtime.last_used -= 400
        self.assertTrue(runtime.release_if_idle())
        self.assertIsNone(runtime.status()['workerPid'])
        runtime.synthesize(text='reload')
        self.assertNotEqual(runtime.status()['workerPid'], first)

    def test_resident_mode_and_no_release_during_speech(self):
        runtime = self.runtime(idle=0)
        runtime.synthesize(text='warm')
        runtime.last_used -= 400
        self.assertFalse(runtime.release_if_idle())
        runtime.configure(1)
        runtime.lock.acquire()
        runtime.last_used -= 400
        self.assertFalse(runtime.release_if_idle())
        runtime.lock.release()
        self.assertTrue(runtime.release_if_idle())

    def test_worker_errors_and_crashes_recover(self):
        runtime = self.runtime()
        for text in ('error', 'crash'):
            with self.assertRaises(VoiceUnavailable):
                runtime.synthesize(text=text)
            self.assertIsNone(runtime.process)
            self.assertTrue(runtime.synthesize(text='recover').startswith(b'RIFF'))

    def test_queue_bounded_and_shutdown_rejects_work(self):
        runtime = self.runtime()
        runtime.synthesize(text='warm')
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            first = pool.submit(runtime.synthesize, text='slow')
            second = pool.submit(runtime.synthesize, text='slow')
            until = time.monotonic() + 2
            while runtime.waiters._value and time.monotonic() < until:
                time.sleep(.01)
            with self.assertRaises(VoiceBusy):
                runtime.synthesize(text='third')
            first.result()
            second.result()
        runtime.close()
        with self.assertRaises(VoiceUnavailable):
            runtime.synthesize(text='after stop')

    def test_timer_releases_worker_without_another_request(self):
        runtime = self.runtime(idle=.1)
        runtime.synthesize(text='timer')
        until = time.monotonic() + 4
        while runtime.status()['workerPid'] and time.monotonic() < until:
            time.sleep(.05)
        self.assertIsNone(runtime.status()['workerPid'])

    @unittest.skipUnless(os.name == 'nt', 'Windows process lifetime regression')
    def test_abrupt_host_exit_does_not_leave_an_orphan_worker(self):
        context = multiprocessing.get_context('spawn')
        connection, child_connection = context.Pipe()
        parent = context.Process(target=parent_exits_abruptly, args=(child_connection,))
        parent.start()
        self.addCleanup(connection.close)
        self.addCleanup(parent.close)
        self.assertTrue(connection.poll(8))
        worker_pid = connection.recv()
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_bool, ctypes.c_ulong]
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x100000, False, worker_pid)
        self.assertTrue(handle)
        try:
            connection.send('exit now')
            parent.join(5)
            self.assertEqual(parent.exitcode, 0)
            self.assertEqual(kernel.WaitForSingleObject(handle, 5000), 0,
                             'Worker must exit even if its HTTP host skipped cleanup')
        finally:
            kernel.CloseHandle(handle)


if __name__ == '__main__':
    unittest.main()
