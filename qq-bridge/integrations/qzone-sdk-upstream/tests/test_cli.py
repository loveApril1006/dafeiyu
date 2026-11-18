import pytest

from qzone_sdk.cli import build_parser, main

ALL_COMMANDS = ["publish", "delete", "like", "comment", "forward", "feed", "moods", "login"]


def test_no_args_prints_help(capsys):
    assert main([]) == 0
    out = capsys.readouterr().out
    assert "QQ 空间操作命令行工具" in out
    for name in ALL_COMMANDS:
        assert name in out


def test_version(capsys):
    with pytest.raises(SystemExit) as e:
        build_parser().parse_args(["--version"])
    assert e.value.code == 0
    out = capsys.readouterr().out
    assert "qzone" in out


def test_each_command_has_help(capsys):
    parser = build_parser()
    for name in ALL_COMMANDS:
        with pytest.raises(SystemExit) as e:
            parser.parse_args([name, "--help"])
        assert e.value.code == 0
        out = capsys.readouterr().out
        assert name in out


def test_unknown_command_fails(capsys):
    parser = build_parser()
    with pytest.raises(SystemExit):
        parser.parse_args(["not-a-command"])
    out = capsys.readouterr().err
    assert "invalid choice" in out
