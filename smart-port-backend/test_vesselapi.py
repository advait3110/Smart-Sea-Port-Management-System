import json
import os
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv

load_dotenv()

BASE = os.getenv("VESSELAPI_BASE_URL", "https://api.vesselapi.com").strip().rstrip("/")
KEY = os.getenv("VESSELAPI_API_KEY", "").strip()
PATH = "/v1/location/vessels/bounding-box"

if not KEY:
    raise SystemExit("VESSELAPI_API_KEY is missing from .env")


def stamp(value):
    return (
        value.astimezone(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def call(label, box, hours=None):
    lat_min, lat_max, lon_min, lon_max = box

    params = {
        "filter.lonLeft": lon_min,
        "filter.lonRight": lon_max,
        "filter.latBottom": lat_min,
        "filter.latTop": lat_max,
        "pagination.limit": 50,
    }

    if hours:
        now = datetime.now(timezone.utc)
        params["time.from"] = stamp(now - timedelta(hours=hours))
        params["time.to"] = stamp(now)

    request = Request(
        f"{BASE}{PATH}?{urlencode(params)}",
        headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json"},
    )

    print(f"\n== {label}")

    try:
        with urlopen(request, timeout=30) as response:
            status = response.status
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        print("HTTP", exc.code, exc.read().decode("utf-8", "replace")[:500])
        return
    except URLError as exc:
        print("Connection error:", exc.reason)
        return

    print("HTTP", status)

    try:
        data = json.loads(body)
    except ValueError:
        print("Not JSON:", body[:300])
        return

    if not isinstance(data, dict):
        print(body[:300])
        return

    print("keys:", list(data.keys()))

    vessels = data.get("vessels")

    if isinstance(vessels, list):
        print("vessels returned:", len(vessels))

        if vessels and isinstance(vessels[0], dict):
            print("first record fields:", sorted(vessels[0].keys()))

    others = {key: value for key, value in data.items() if key != "vessels"}
    print("other fields:", json.dumps(others, default=str)[:400])


SINGAPORE = (1.10, 1.45, 103.55, 104.15)

call("Singapore, 2 h window (what the app uses now)", SINGAPORE, 2)
call("Singapore, 4 h window (provider maximum)", SINGAPORE, 4)
call("Singapore, no time filter", SINGAPORE)
call("Wider Singapore Strait box, 4 h", (0.9, 1.6, 103.3, 104.5), 4)
call("CONTROL: Dover Strait, 4 h", (50.9, 51.2, 1.2, 1.6), 4)