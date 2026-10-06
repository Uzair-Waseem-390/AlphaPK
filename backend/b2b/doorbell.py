"""
Everything AlphaPK sends TO a partner software: the "doorbell" (after a decision) and the
wake-up check that must succeed before any operation that depends on that partner.

The wake-up rule: before this software changes its own data in a way that depends on the
partner (accept / deny a request), it makes one signed readiness call to the partner. If
that does not answer 200 within a few seconds, the operation does NOTHING — no change here,
no further call. (The 90-second patience lives in the browser: the user presses "Wake up"
and the browser asks again every few seconds.)

The doorbell stays fire-and-forget on a daemon thread: the partner pulls the real details
itself (and again at its own catch-up), so a missed ring loses nothing.
"""

import json
import logging
import threading
import time
from urllib import error as urllib_error
from urllib import parse
from urllib import request as urlrequest

from django.conf import settings
from rest_framework.exceptions import APIException

from . import config
from .signing import HEADER_CLIENT, HEADER_SIGNATURE, HEADER_TIMESTAMP, compute_signature

logger = logging.getLogger("b2b.doorbell")

DOORBELL_PATH = "/api/b2b/partner/purchase-requests/decided/"
PING_PATH = "/api/b2b/partner/ping/"
WAKE_TIMEOUT_SECONDS = 5.0


class PartnerNotAwake(APIException):
    """Raised BEFORE anything is written: the partner did not answer its readiness check."""
    status_code = 409
    default_detail = (
        "The partner software is not awake right now, so nothing was changed. "
        "Press \"Wake up\", wait until it answers, and try again."
    )
    default_code = "partner_not_awake"


class PartnerConnectionRefused(APIException):
    """The partner answered but refused us (wrong secret / name / address): waiting will not help."""
    status_code = 409
    default_detail = (
        "The partner did not accept this connection, so nothing was changed. Check that the shared "
        "secret, this software's company name and the partner's address match on both sides, and that "
        "both servers' clocks are correct."
    )
    default_code = "partner_connection_refused"


class _NoRedirect(urlrequest.HTTPRedirectHandler):
    """Signed headers must only ever go to the configured host."""

    def redirect_request(self, *args, **kwargs):
        return None


_opener = urlrequest.build_opener(_NoRedirect)


def _signed_request(partner_name: str, method: str, path: str, body: bytes = b""):
    """A ready-to-send signed request to the partner, or None when this software isn't set up to reach it."""
    base = config.partner_base_urls().get(partner_name)
    secret = config.partner_secrets().get(partner_name)
    own_name = getattr(settings, "COMPANY_NAME", None)
    if not (base and secret and own_name and own_name.isascii() and own_name.isprintable()):
        logger.warning("b2b call to %r skipped: URL, secret or COMPANY_NAME not configured.", partner_name)
        return None

    try:
        split = parse.urlsplit(base.strip())
    except ValueError:                                  # e.g. an unbalanced "[" in the host
        logger.warning("b2b call to %r skipped: invalid base URL.", partner_name)
        return None
    if split.scheme not in ("http", "https") or not split.netloc:
        logger.warning("b2b call to %r skipped: invalid base URL.", partner_name)
        return None
    if split.scheme != "https" and not settings.DEBUG:
        logger.warning("b2b call to %r skipped: http:// is only allowed when DEBUG is on.", partner_name)
        return None

    full_path = split.path.rstrip("/") + path
    url = parse.urlunsplit((split.scheme, split.netloc, full_path, "", ""))
    if not (url.isascii() and url.isprintable()):
        return None

    timestamp = int(time.time())
    signature = compute_signature(
        secret, timestamp=timestamp, method=method, path=full_path, query="", body=body,
    )
    headers = {HEADER_CLIENT: own_name, HEADER_TIMESTAMP: str(timestamp), HEADER_SIGNATURE: signature}
    if body:
        headers["Content-Type"] = "application/json"
    return urlrequest.Request(url, data=body if method == "POST" else None, method=method, headers=headers)


# ---------------------------------------------------------------------------
# Wake-up check
# ---------------------------------------------------------------------------

def partner_wake_status(partner_name: str) -> str:
    """
    One signed readiness call (5s limit).
    'awake'          HTTP 200
    'asleep'         no answer in time / connection failed / server error (it may still be waking up)
    'not_configured' it answered but refused us (401/403/404), or this software isn't set up to reach it
    """
    req = _signed_request(partner_name, "GET", PING_PATH)
    if req is None:
        return "not_configured"
    try:
        with _opener.open(req, timeout=WAKE_TIMEOUT_SECONDS) as resp:
            resp.read(1024)
            return "awake" if resp.status == 200 else "asleep"
    except urllib_error.HTTPError as exc:
        code = exc.code
        exc.close()
        status = "not_configured" if code in (401, 403, 404) else "asleep"
        logger.info("b2b wake check for %r answered HTTP %s -> %s", partner_name, code, status)
        return status
    except Exception as exc:  # noqa: BLE001 — any other failure simply means "not awake"
        logger.info("b2b wake check for %r failed: %s", partner_name, type(exc).__name__)
        return "asleep"


def partner_is_awake(partner_name: str) -> bool:
    return partner_wake_status(partner_name) == "awake"


def ensure_partner_awake(partner_name: str) -> None:
    """Gate for every operation that depends on the partner. Raises a 409 BEFORE anything is written."""
    status = partner_wake_status(partner_name)
    if status == "asleep":
        raise PartnerNotAwake()
    if status == "not_configured":
        raise PartnerConnectionRefused()


# ---------------------------------------------------------------------------
# Doorbell
# ---------------------------------------------------------------------------

def notify_partner(partner_name: str, request_uuid) -> None:
    """Starts the ring on a daemon thread and returns immediately. Never raises."""
    try:
        threading.Thread(
            target=_ring, args=(partner_name, str(request_uuid)), daemon=True, name="b2b-doorbell",
        ).start()
    except Exception as exc:  # noqa: BLE001 — the decision is already committed; the partner will pull it
        logger.warning("b2b doorbell for %r could not start: %s", partner_name, type(exc).__name__)


def _ring(partner_name: str, request_uuid: str) -> None:
    try:
        body = json.dumps({"request_uuid": request_uuid}).encode()
        req = _signed_request(partner_name, "POST", DOORBELL_PATH, body)
        if req is None:
            return
        with _opener.open(req, timeout=config.timeout_seconds()) as resp:
            resp.read(1024)
    except Exception as exc:  # noqa: BLE001 — by design nothing may escape this thread
        logger.warning("b2b doorbell for %r failed: %s", partner_name, type(exc).__name__)
