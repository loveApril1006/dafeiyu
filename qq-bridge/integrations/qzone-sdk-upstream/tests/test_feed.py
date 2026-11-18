from qzone_sdk.utils.feed import hex_decode, parse_feed_item, parse_mood


def test_hex_decode():
    assert hex_decode(r"\x48\x69") == "Hi"


def test_parse_feed_item():
    raw = (
        "key:'k1',appid:'311',typeid:'0',opuin:'123',uin:'123',"
        "nickname:'ZhangSan',abstime:1700000000,feedstime:'2023-11-14 12:00:00',"
        "cmtnum:'3',likecount:'5',"
        "html:'<div class=\\\"f-info\\\">\\x48\\x69</div>"
        "<img data-originurl=\\\"http://example.com/a.jpg\\\" src=\\\"http://example.com/a.jpg\\\"/>',"
    )
    item = parse_feed_item(raw)
    assert item["key"] == "k1"
    assert item["appid"] == "311"
    assert item["appid_name"] == "说说"
    assert item["nickname"] == "ZhangSan"
    assert item["cmtnum"] == 3
    assert item["likecount"] == 5
    assert item["content"] == "Hi"
    assert item["images"] == ["http://example.com/a.jpg"]


def test_parse_mood():
    msg = {
        "tid": "t1",
        "content": "hello",
        "created_time": 1700000000,
        "createTime": "2023-11-14",
        "cmtnum": 1,
        "fwdnum": 2,
        "name": "ZhangSan",
        "uin": "123",
        "lbs": {"lbs_type": 1},
        "pic": [
            {"url1": "http://a/1.jpg", "smallurl": "http://a/s1.jpg", "width": 10, "height": 20}
        ],
        "rt_con": {"content": "repost"},
    }
    item = parse_mood(msg)
    assert item["tid"] == "t1"
    assert item["pic"][0]["url"] == "http://a/1.jpg"
    assert item["rt_content"] == "repost"
