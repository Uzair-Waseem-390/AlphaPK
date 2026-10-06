"""
Reads the B2B_* settings lazily (so tests can override them) and parses the
JSON-map env values defensively: a malformed value means "no partners", it
never crashes the process or leaks the value into a log line.
"""

import json
import logging
from functools import lru_cache
from types import MappingProxyType

from django.conf import settings

logger = logging.getLogger("b2b.config")

_UNITS = {"second": 1, "minute": 60, "hour": 3600, "day": 86400}


@lru_cache(maxsize=16)
def _parse_json_map(raw: str, label: str):
    if not raw or not raw.strip():
        return MappingProxyType({})
    try:
        data = json.loads(raw)
    except ValueError:
        logger.error("%s is not valid JSON; it is being ignored.", label)
        return MappingProxyType({})
    if not isinstance(data, dict):
        logger.error("%s must be a JSON object; it is being ignored.", label)
        return MappingProxyType({})
    return MappingProxyType({
        str(k): str(v) for k, v in data.items() if str(k).strip() and str(v).strip()
    })


def provider_enabled() -> bool:
    return bool(getattr(settings, "B2B_PROVIDER_ENABLED", False))


def partner_secrets():
    """{partner COMPANY_NAME: shared secret} — read-only mapping."""
    return _parse_json_map(getattr(settings, "B2B_PARTNER_SECRETS", "") or "", "B2B_PARTNER_SECRETS")


def signature_max_age_seconds() -> int:
    try:
        return max(1, int(getattr(settings, "B2B_SIGNATURE_MAX_AGE_SECONDS", 60)))
    except (TypeError, ValueError):
        return 60


def failed_auth_limit():
    """Parses '10/hour' -> (10, 3600). Falls back to 10/hour when malformed."""
    raw = str(getattr(settings, "B2B_FAILED_AUTH_LIMIT", "10/hour"))
    try:
        count, unit = raw.split("/", 1)
        return max(1, int(count)), _UNITS[unit.strip().lower()]
    except (ValueError, KeyError):
        return 10, 3600


# ---------------------------------------------------------------------------
# Purchase requests
# ---------------------------------------------------------------------------

MAX_REQUEST_ITEMS = 100


def partner_base_urls():
    """{partner COMPANY_NAME: that software's backend root URL} — used to ring its doorbell."""
    return _parse_json_map(getattr(settings, "B2B_PARTNER_BASE_URLS", "") or "", "B2B_PARTNER_BASE_URLS")


def customer_code_for(partner_name: str) -> str:
    """The customer record that stands for this partner on invoices ('' when not set)."""
    codes = getattr(settings, "B2B_PARTNER_CUSTOMER_CODES", {}) or {}
    return (codes.get(partner_name) or "").strip()


def timeout_seconds() -> float:
    """Per-socket-operation timeout for one outgoing call (connect and each read), clamped to 0.5s..10s."""
    try:
        return min(10.0, max(0.5, float(getattr(settings, "B2B_PARTNER_TIMEOUT_SECONDS", 3))))
    except (TypeError, ValueError):
        return 3.0
