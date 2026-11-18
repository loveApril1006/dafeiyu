"""Heavy inference runs in one disposable child, never the HTTP host."""


def run_worker(requests, responses):
    import traceback
    try:
        from tools import voice_engine as engine
        responses.put(('ready', {'compute': engine.DEVICE, 'device': engine.DEVICE_NAME}))
    except Exception:
        traceback.print_exc()
        responses.put(('error', 'Voice model failed to load'))
        return
    while True:
        request = requests.get()
        if request is None:
            return
        try:
            responses.put(('audio', engine.synthesize(**request)))
        except Exception:
            traceback.print_exc()
            responses.put(('error', 'Voice synthesis failed'))
