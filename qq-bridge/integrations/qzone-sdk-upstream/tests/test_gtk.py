from qzone_sdk.utils.gtk import compute_g_tk, compute_ptqrtoken


def test_compute_g_tk_known_vector():
    # 手算基准：g_tk 初值 5381
    assert compute_g_tk("abc") == 193485963


def test_compute_g_tk_empty():
    assert compute_g_tk("") == 5381


def test_compute_ptqrtoken_known_vector():
    # 手算基准：ptqrtoken 初值 0（与 g_tk 不同）
    assert compute_ptqrtoken("abc") == 108966


def test_compute_ptqrtoken_empty():
    assert compute_ptqrtoken("") == 0
