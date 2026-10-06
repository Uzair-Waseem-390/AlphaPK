"""
The "doorbell": after a purchase request is accepted or denied, tell the partner
software to come and fetch the decision.

Deliberately fire-and-forget. The partner pulls the real details itself through
the signed decisions endpoint (and again at its own catch-up), so a missed ring
loses nothing. It runs on a short-lived daemon thread so a slow or offline
partner can never delay the admin's Accept / Deny click, and every failure is
swallowed after a log line.
"""

import json
import logging
import threading
import time
from urllib import parse
from urllib import request as urlrequest

from django.conf import settings

from . import config
from .signing import HEADER_CLIENT, HEADER_SIGNATURE, HEADER_TIMESTAMP, compute_signature

logger = logging.getLogger("b2b.doorbell")

DOORBELL_PATH = "/api/b2b/partner/purchase-requests/decided/"


class _NoRedirect(urlrequest.HTTPRedirectHandler):
    """Signed headers must only ever go to the configured host."""

    def redirect_request(self, *args, **kwargs):
        return None


_opener = urlrequest.build_opener(_NoRedirect)


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
        base = config.partner_base_urls().get(partner_name)
        secret = config.partner_secrets().get(partner_name)
        own_name = getattr(settings, "COMPANY_NAME", None)
        if not (base and secret and own_name and own_name.isascii() and own_name.isprintable()):
            logger.warning("b2b doorbell for %r skipped: URL, secret or COMPANY_NAME not configured.", partner_name)
            return

        split = parse.urlsplit(base.strip())
        if split.scheme not in ("http", "https") or not split.netloc:
            logger.warning("b2b doorbell for %r skipped: invalid base URL.", partner_name)
            return
        if split.scheme != "https" and not settings.DEBUG:
            logger.warning("b2b doorbell for %r skipped: http:// is only allowed when DEBUG is on.", partner_name)
            return

        full_path = split.path.rstrip("/") + DOORBELL_PATH
        url = parse.urlunsplit((split.scheme, split.netloc, full_path, "", ""))
        if not (url.isascii() and url.isprintable()):
            return

        body = json.dumps({"request_uuid": request_uuid}).encode()
        timestamp = int(time.time())
        signature = compute_signature(
            secret, timestamp=timestamp, method="POST", path=full_path, query="", body=body,
        )
        req = urlrequest.Request(
            url, data=body, method="POST",
            headers={
                "Content-Type": "application/json",
                HEADER_CLIENT: own_name,
                HEADER_TIMESTAMP: str(timestamp),
                HEADER_SIGNATURE: signature,
            },
        )
        with _opener.open(req, timeout=config.timeout_seconds()) as resp:
            resp.read(1024)
    except Exception as exc:  # noqa: BLE001 — by design nothing may escape this thread
        logger.warning("b2b doorbell for %r failed: %s", partner_name, type(exc).__name__)
