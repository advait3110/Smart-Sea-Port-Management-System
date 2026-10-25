import json, os
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from dotenv import load_dotenv

load_dotenv()
KEY = os.getenv("VESSELAPI_API_KEY", "").strip()
BASE = os.getenv("VESSELAPI_BASE_URL", "https://api.vesselapi.com").strip().rstrip("/")


def get(path, params=None):
    url = BASE + path + ("?" + urlencode(params) if params else "")
    req = Request(url, headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json"})
    try:
        with urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8")
    except HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except URLError as e:
        return None, str(e.reason)


def show(label, result, limit=1800):
    status, body = result
    print(f"\n== {label}\nHTTP {status}\n{body[:limit]}")


stamp = lambda d: d.isoformat(timespec="seconds").replace("+00:00", "Z")
now = datetime.now(timezone.utc)

# 1. Pick a real vessel from Singapore waters.
status, body = get("/v1/location/vessels/bounding-box", {
    "filter.lonLeft": 103.55, "filter.lonRight": 104.15,
    "filter.latBottom": 1.10, "filter.latTop": 1.45,
    "pagination.limit": 1,
    "time.from": stamp(now - timedelta(hours=2)), "time.to": stamp(now),
})
mmsi = json.loads(body)["vessels"][0]["mmsi"]
print("Using real MMSI:", mmsi)

# 2. Paths below are best guesses from the client library's method names.
show("vessel details", get(f"/v1/vessel/{mmsi}", {"filter.idType": "mmsi"}))
show("vessel ETA", get(f"/v1/vessel/{mmsi}/eta", {"filter.idType": "mmsi"}))
show("port events at SGSIN, last 24 h", get("/v1/portevents/port/SGSIN", {
    "time.from": stamp(now - timedelta(hours=24)), "time.to": stamp(now),
    "pagination.limit": 3,
}))
show("last port event for this vessel", get(f"/v1/portevents/vessel/{mmsi}/last", {"filter.idType": "mmsi"}))