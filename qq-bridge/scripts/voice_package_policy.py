"""Public inference payload policy; keep CUDA/model assets, omit only compiler SDK."""
VOICE_CODE = ('pet_server.py', 'tools/voice_engine.py', 'tools/voice_lifecycle.py',
              'tools/voice_worker.py', 'Start-GPT-SoVITS.ps1',
              'Voice-Service-Common.ps1', 'Restart-GPT-SoVITS.ps1')
TORCH = 'GPT-SoVITS/runtime/Lib/site-packages/torch/'


def is_voice_development_file(relative):
    return (relative.startswith((TORCH + 'include/', TORCH + 'share/cmake/')) or
            relative.startswith(TORCH + 'lib/') and
            '/' not in relative[len(TORCH + 'lib/'):] and relative.endswith('.lib'))
