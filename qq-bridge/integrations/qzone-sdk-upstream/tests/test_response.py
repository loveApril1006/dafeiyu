from qzone_sdk.utils.response import success_or_error


def test_success():
    result = success_or_error({"code": 0, "t1_tid": "abc", "t1_time": "123", "content": "hi"})
    assert result == {"success": True, "tid": "abc", "time": "123", "content": "hi"}


def test_success_with_curkey():
    result = success_or_error({"code": 0, "t1_tid": "abc", "curkey": "abc"})
    assert result["curkey"] == "abc"


def test_success_without_curkey():
    result = success_or_error({"code": 0, "t1_tid": "abc"})
    assert "curkey" not in result


def test_success_with_tid_field():
    result = success_or_error({"code": 0, "tid": "xyz"})
    assert result["success"] is True
    assert result["tid"] == "xyz"


def test_failure():
    result = success_or_error({"code": -1, "message": "boom"})
    assert result["success"] is False
    assert result["message"] == "boom"


def test_failure_ret_fallback():
    result = success_or_error({"ret": 3, "msg": "err"})
    assert result["success"] is False
    assert result["code"] == 3
    assert result["message"] == "err"


def test_none():
    result = success_or_error(None)
    assert result["success"] is False
