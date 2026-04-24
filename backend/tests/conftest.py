"""Conftest: ensure REACT_APP_BACKEND_URL is populated for tests.
The test harness runs outside the frontend shell, so load frontend/.env
so the backend URL fallback points to the public ingress (cookies require
Secure over HTTPS)."""
import os
from pathlib import Path


def _load_frontend_env():
    fe_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if not fe_env.exists():
        return
    for line in fe_env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


if not os.environ.get("REACT_APP_BACKEND_URL") and not os.environ.get("TEST_BASE_URL"):
    _load_frontend_env()
