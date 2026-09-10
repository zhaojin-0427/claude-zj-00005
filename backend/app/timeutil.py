"""Client wall-clock helpers.

所有课程时间都以门店当地「墙钟时间」的 naive datetime 存储（种子数据也是
当地时间，如 2026-09-10 09:00）。容器运行在 UTC，而用户浏览器可能在
UTC+8，因此涉及「此刻」的校验一律以请求头 X-Client-Time（前端本地时间，
无时区后缀）为准；缺失时回退到服务器本地时间。
"""
from datetime import datetime
from fastapi import Header


def parse_client_time(x_client_time: str | None) -> datetime:
    if x_client_time:
        try:
            dt = datetime.fromisoformat(x_client_time.replace("Z", ""))
            return dt.replace(tzinfo=None)
        except ValueError:
            pass
    return datetime.now()


def client_now(x_client_time: str | None = Header(default=None)) -> datetime:
    """FastAPI dependency: 解析客户端当前墙钟时间。"""
    return parse_client_time(x_client_time)


def server_now_iso() -> str:
    """给前端的参考：服务器本地时间（无时区后缀，ISO 格式）。"""
    return datetime.now().isoformat(timespec="seconds")


def ensure_aware(dt: datetime) -> datetime:
    """fromisoformat 可能解析出带时区的值，统一转本地 naive 比较。"""
    if dt.tzinfo is not None:
        return dt.astimezone().replace(tzinfo=None)
    return dt
