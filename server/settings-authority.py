"""Narrow Hermes Settings authority bridge for Pocket.

Reads one JSON request from stdin and emits one JSON response. This reuses the
same web_server handlers as Hermes Desktop; it never exposes env reveal.
"""
from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from hermes_cli import web_server as web

def is_secret_key(key: Any) -> bool:
    name = str(key).lower().replace("-", "_")
    return name in {"api_key", "token", "password", "secret", "client_secret", "access_token", "refresh_token"} or name.endswith(("_api_key", "_password", "_secret", "_access_token", "_refresh_token"))


def scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items() if not is_secret_key(k)}
    if isinstance(value, list):
        return [scrub(v) for v in value]
    return value


def contains_secret_key(value: Any) -> bool:
    if isinstance(value, dict):
        return any(is_secret_key(k) or contains_secret_key(v) for k, v in value.items())
    return isinstance(value, list) and any(contains_secret_key(v) for v in value)


def emit(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


async def dispatch(req: dict[str, Any]) -> Any:
    action = req.get("action")
    if action == "snapshot":
        return {"config": scrub(await web.get_config()), "schema": await web.get_schema(), "env": await web.get_env_vars()}
    if action == "config.get":
        return {"config": scrub(await web.get_config())}
    if action == "config.defaults":
        return {"config": scrub(await web.get_defaults())}
    if action == "config.schema":
        return await web.get_schema()
    if action == "config.save":
        incoming = req.get("config") or {}
        if contains_secret_key(incoming):
            raise ValueError("secret_fields_must_use_env")
        body = web.ConfigUpdate(config=incoming)
        return await web.update_config(body)
    if action == "env.list":
        return {"env": await web.get_env_vars()}
    if action == "env.set":
        body = web.EnvVarUpdate(key=str(req.get("key") or ""), value=str(req.get("value") or ""))
        return await web.set_env_var(body)
    if action == "env.delete":
        body = web.EnvVarDelete(key=str(req.get("key") or ""))
        return await web.remove_env_var(body)
    if action == "providers.custom.list":
        return scrub(web.list_custom_endpoints())
    if action == "providers.custom.save":
        body = web.CustomEndpointUpdate(**(req.get("endpoint") or {}))
        return scrub(web.upsert_custom_endpoint(body))
    if action == "providers.custom.delete":
        return scrub(web.delete_custom_endpoint(str(req.get("id") or "")))
    if action == "providers.custom.activate":
        return scrub(web.activate_custom_endpoint(str(req.get("id") or "")))
    raise ValueError("unsupported_settings_action")


async def main() -> None:
    try:
        raw = sys.stdin.read(2_000_000)
        request = json.loads(raw or "{}")
        emit(await dispatch(request))
    except Exception as exc:
        emit({"error": type(exc).__name__, "message": str(exc)[:500]})
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
