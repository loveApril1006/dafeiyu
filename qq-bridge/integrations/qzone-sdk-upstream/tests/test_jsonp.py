from qzone_sdk.utils.jsonp import parse_jsonp


def test_preload_callback():
    raw = '_preloadCallback({"code":0,"data":{}});'
    assert parse_jsonp(raw) == {"code": 0, "data": {}}


def test_frame_element_callback():
    raw = 'frameElement.callback({"ret":1})'
    assert parse_jsonp(raw)["ret"] == 1


def test_callback():
    raw = 'callback({"a":1});'
    assert parse_jsonp(raw) == {"a": 1}


def test_plain_json():
    assert parse_jsonp('{"code":0}') == {"code": 0}


def test_garbage():
    assert parse_jsonp("not json at all") is None
