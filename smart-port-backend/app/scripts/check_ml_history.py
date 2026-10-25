"""
check_ml_history.py  -  READ-ONLY check of the history the Vessel Delay model needs.

What it does
    Counts what is already stored in the port database that a delay model
    could learn from:
      1. Ship positions saved over time (AIS position history)
      2. Reported ETAs (the vessels table, and any table that keeps ETAs over time)
      3. Arrivals the history can show (ship stops: moored / at anchor)
      4. Arrivals that ALSO have an ETA saved before the ship arrived
         (= the training examples the model needs)
      5. Port-call events
    Then it prints a verdict: can we train now, or must we first start
    saving ETA snapshots.

It never changes anything
    Every query runs inside a READ ONLY transaction that is rolled back.
    PostgreSQL itself refuses any write inside such a transaction.

How to run (Windows, VS Code terminal)
    The file may sit in smart-port-backend\\scripts or smart-port-backend\\app\\scripts,
    and it can be run from any folder, for example:
    python check_ml_history.py

It uses the same database connection as the backend (app.core.database),
or the database address from the backend's .env file if that import fails.
"""

import os
import sys
from datetime import datetime, timezone, timedelta


def find_backend_root():
    """Walk up from this file until the folder that holds app\\ (the backend folder)."""
    here = os.path.dirname(os.path.abspath(__file__))
    folder = here
    for _ in range(6):
        if os.path.isdir(os.path.join(folder, "app")) and (
            os.path.exists(os.path.join(folder, ".env"))
            or os.path.exists(os.path.join(folder, "requirements.txt"))
        ):
            return folder
        parent = os.path.dirname(folder)
        if parent == folder:
            break
        folder = parent
    return os.path.dirname(here)


BACKEND_ROOT = find_backend_root()
# The backend reads .env from the folder it is started in, so start from the backend folder.
os.chdir(BACKEND_ROOT)
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from sqlalchemy import create_engine, text  # noqa: E402

# ---------------------------------------------------------------- settings
# Port of Singapore waters (terminals, anchorages and the strait next to them).
PORT_AREA = {"lat_min": 1.15, "lat_max": 1.35, "lon_min": 103.60, "lon_max": 104.10}
# An arrival time is "precise" when the position before it is at most this old.
PRECISE_GAP_HOURS = 3
# How far back before an arrival a saved ETA may be to count as "the reported ETA".
ETA_LOOKBACK_HOURS = 72
# Training examples needed for an honest train/test split (80% / 20%).
NEEDED_ARRIVALS = 300
SGT = timezone(timedelta(hours=8))


# ---------------------------------------------------------------- connection
URL_NAMES = ["DATABASE_URL", "SQLALCHEMY_DATABASE_URL", "SQLALCHEMY_DATABASE_URI", "DB_URL",
             "POSTGRES_URL", "SUPABASE_DB_URL", "SUPABASE_DATABASE_URL"]


def url_from_env_file():
    """Find a postgres address in the environment or the backend's .env file."""
    for name in URL_NAMES:
        if os.environ.get(name, "").startswith("postgres"):
            return os.environ[name], name
    env_path = os.path.join(BACKEND_ROOT, ".env")
    if not os.path.exists(env_path):
        return None, None
    found = {}
    with open(env_path, encoding="utf-8-sig") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip().replace("export ", "").upper()
            value = value.strip().strip('"').strip("'")
            if value.startswith("postgres"):
                found[key] = value
    for name in URL_NAMES:
        if name in found:
            return found[name], name
    if found:
        name = sorted(found)[0]
        return found[name], name
    return None, None


def get_engine():
    """Use the backend's own engine; fall back to the database address in .env."""
    backend_error = None
    try:
        import app.core.database as dbmod  # type: ignore

        engine = getattr(dbmod, "engine", None)
        if engine is None and hasattr(dbmod, "SessionLocal"):
            engine = getattr(dbmod.SessionLocal, "kw", {}).get("bind")
        if engine is None:
            raise RuntimeError("app.core.database has no 'engine'")
        if type(engine).__name__ == "AsyncEngine":
            raise RuntimeError("the backend engine is async")
        return engine, "backend connection (app.core.database)"
    except Exception as exc:
        backend_error = str(exc).splitlines()[0][:200] if str(exc) else type(exc).__name__

    url, name = url_from_env_file()
    if not url:
        print(f"Backend folder used: {BACKEND_ROOT}")
        print(f"Loading app.core.database failed: {backend_error}")
        print(f".env file found: {os.path.exists(os.path.join(BACKEND_ROOT, '.env'))}")
        sys.exit("Could not find the database address. Paste these lines into the chat.")
    for prefix in ("postgresql+asyncpg://", "postgres://"):
        if url.startswith(prefix):
            url = "postgresql://" + url[len(prefix):]
    return create_engine(url, pool_pre_ping=True), f"{name} from .env"


class ReadOnlyDB:
    def __init__(self, engine):
        self.engine = engine

    def rows(self, sql):
        """Run one SELECT inside a READ ONLY transaction, always rolled back."""
        with self.engine.connect() as conn:
            trans = conn.begin()
            try:
                conn.execute(text("SET TRANSACTION READ ONLY"))
                conn.execute(text("SET LOCAL statement_timeout = '180s'"))
                return [tuple(r) for r in conn.execute(text(sql)).fetchall()]
            finally:
                trans.rollback()

    def one(self, sql):
        result = self.rows(sql)
        return result[0] if result else None

    def safe_one(self, sql):
        try:
            return self.one(sql), None
        except Exception as exc:  # report, keep going
            return None, str(exc).splitlines()[0][:200]


# ---------------------------------------------------------------- helpers
def q(name):
    return '"' + str(name).replace('"', '""') + '"'


def num(value):
    if value is None or value == "":
        return 0
    return int(float(value))


def show(value):
    return "-" if value in (None, "") else str(value)


def pick(columns, candidates):
    for c in candidates:
        if c in columns:
            return c
    return None


def is_time(dtype):
    return dtype.startswith("timestamp") or dtype == "date"


def sg_ts(col, dtype):
    """Expression giving the Singapore local time of a column."""
    if dtype == "timestamp with time zone":
        return f"({q(col)} AT TIME ZONE 'Asia/Singapore')"
    if dtype == "date":
        return f"({q(col)}::timestamp)"
    # naive timestamps are stored as UTC (same rule as the Analytics page)
    return f"(({q(col)} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Singapore')"


def utc_ts(col, dtype, alias=None):
    """Expression giving a column as an exact moment (timestamptz), whatever the server time zone."""
    ref = (alias + "." if alias else "") + q(col)
    if dtype == "timestamp with time zone":
        return ref
    if dtype == "date":
        return f"({ref}::timestamp AT TIME ZONE 'Asia/Singapore')"
    return f"({ref} AT TIME ZONE 'UTC')"  # naive timestamps are UTC


def fmt_ts(expr):
    return f"to_char({expr}, 'YYYY-MM-DD HH24:MI')"


def stopped_expr(col, dtype):
    """True when an AIS status means the ship has stopped (moored / at anchor)."""
    if dtype in ("integer", "smallint", "bigint", "numeric"):
        return f"({q(col)} IN (1, 5))"  # AIS codes: 1 = at anchor, 5 = moored
    c = f"lower({q(col)}::text)"
    return f"({c} LIKE '%moor%' OR {c} LIKE '%berth%' OR {c} LIKE '%anchor%')"


def title(text_):
    print()
    print(text_)
    print("-" * len(text_))


# ---------------------------------------------------------------- main
def main():
    engine, how = get_engine()
    db = ReadOnlyDB(engine)
    now_sg = datetime.now(SGT).strftime("%Y-%m-%d %H:%M")

    print("=" * 66)
    print(" VESSEL DELAY - HISTORY CHECK (read only, nothing is changed)")
    print("=" * 66)
    print(f" Run at {now_sg} Singapore time, using the {how}")

    try:
        db.one("SELECT 1")
    except Exception as exc:
        sys.exit(f"Could not connect to the database: {str(exc).splitlines()[0]}")

    # ---- table and column map
    col_rows = db.rows(
        "SELECT table_name, column_name, data_type FROM information_schema.columns "
        "WHERE table_schema = 'public' ORDER BY table_name, ordinal_position"
    )
    tables = {}
    for t, c, d in col_rows:
        tables.setdefault(t, {})[c] = d

    title("1. Tables found")
    print(f" {len(tables)} tables in the database.")

    def find_table(exact, contains):
        for name in exact:
            if name in tables:
                return name
        for name in sorted(tables):
            if all(part in name for part in contains):
                return name
        return None

    TIME_COLS = ["recorded_at", "timestamp", "position_time", "received_at", "reported_at",
                 "observed_at", "time", "created_at", "fetched_at", "updated_at"]
    MMSI_COLS = ["mmsi", "vessel_mmsi", "ship_mmsi", "imo", "vessel_id"]

    def time_col(cols):
        for c in TIME_COLS:
            if c in cols and is_time(cols[c]):
                return c
        for c, d in cols.items():
            if is_time(d) and "eta" not in c:
                return c
        return None

    # ---- 2. AIS position history
    title("2. Ship positions saved over time (AIS position history)")
    hist = find_table(["ais_position_history", "ais_position_histories", "ais_positions_history"],
                      ["position", "history"])
    H = {}
    hist_days = 0
    if not hist:
        print(" No AIS position history table found.")
    else:
        cols = tables[hist]
        H = {
            "table": hist,
            "mmsi": pick(cols, MMSI_COLS),
            "ts": time_col(cols),
            "lat": pick(cols, ["latitude", "lat"]),
            "lon": pick(cols, ["longitude", "lon", "lng"]),
            "speed": pick(cols, ["speed_knots", "speed", "sog", "speed_over_ground"]),
            "status": pick(cols, ["navigation_status", "nav_status", "navigational_status", "status"]),
            "eta": pick(cols, ["eta", "reported_eta", "eta_utc"]),
        }
        H["ts_type"] = cols.get(H["ts"], "")
        H["status_type"] = cols.get(H["status"], "")
        print(f" Table: {hist}")
        print(f" Columns used: ship={show(H['mmsi'])}, time={show(H['ts'])}, "
              f"speed={show(H['speed'])}, status={show(H['status'])}, ETA={show(H['eta'])}")
        if not (H["mmsi"] and H["ts"]):
            print(" Cannot read it: no ship id or no time column.")
            H = {}
        else:
            T, M, TS = q(hist), q(H["mmsi"]), sg_ts(H["ts"], H["ts_type"])
            r, err = db.safe_one(
                f"SELECT count(*), count(DISTINCT {M}), {fmt_ts(f'min({TS})')}, {fmt_ts(f'max({TS})')}, "
                f"count(DISTINCT ({TS})::date) FROM {T}"
            )
            if err:
                print(f" Could not count: {err}")
                H = {}
            else:
                hist_days = num(r[4])
                print(f" Saved positions:     {num(r[0]):,}")
                print(f" Different ships:     {num(r[1]):,}")
                print(f" First / last saved:  {show(r[2])}  ->  {show(r[3])}  (Singapore time)")
                print(f" Days with positions: {hist_days}")
                if H["lat"] and H["lon"]:
                    a = PORT_AREA
                    r2, _ = db.safe_one(
                        f"SELECT count(*) FROM {T} WHERE {q(H['lat'])} BETWEEN {a['lat_min']} AND {a['lat_max']} "
                        f"AND {q(H['lon'])} BETWEEN {a['lon_min']} AND {a['lon_max']}"
                    )
                    if r2:
                        print(f" Inside Singapore port waters: {num(r2[0]):,}")
                r3, _ = db.safe_one(
                    f"SELECT round(avg(gap_min)::numeric, 0) FROM ("
                    f" SELECT extract(epoch FROM ({q(H['ts'])} - lag({q(H['ts'])}) OVER "
                    f"(PARTITION BY {M} ORDER BY {q(H['ts'])}))) / 60 AS gap_min FROM {T}) g "
                    f"WHERE gap_min IS NOT NULL"
                )
                if r3 and r3[0] is not None:
                    print(f" Average time between two positions of the same ship: {num(r3[0])} minutes")

    # ---- 3. Reported ETAs
    title("3. Reported ETAs")
    vessels = find_table(["vessels", "vessel"], ["vessel"])
    expected_24h = None
    if vessels:
        cols = tables[vessels]
        v_eta = pick(cols, ["eta", "reported_eta", "eta_utc", "estimated_arrival"])
        v_dest = pick(cols, ["destination", "dest"])
        print(f" Vessels table: {vessels}  (keeps only the LATEST ETA of each ship)")
        if not v_eta:
            print(" It has no ETA column.")
        else:
            T, E, et = q(vessels), q(v_eta), cols[v_eta]
            filled = f"{E} IS NOT NULL" + ("" if is_time(et) else f" AND trim({E}::text) <> ''")
            r, err = db.safe_one(f"SELECT count(*), count(*) FILTER (WHERE {filled}) FROM {T}")
            if err:
                print(f" Could not count: {err}")
            else:
                print(f" Ships in the table:  {num(r[0]):,}")
                print(f" Ships with an ETA:   {num(r[1]):,}   (ETA column type: {et})")
            if is_time(et):
                cmp = E if et == "timestamp with time zone" else f"({E} AT TIME ZONE 'UTC')"
                r, _ = db.safe_one(
                    f"SELECT count(*) FILTER (WHERE {cmp} > now()), "
                    f"count(*) FILTER (WHERE {cmp} > now() AND {cmp} <= now() + interval '24 hours') FROM {T}"
                )
                if r:
                    expected_24h = num(r[1])
                    print(f" ETA still ahead:     {num(r[0]):,}   (of which within 24 hours: {expected_24h})")
            if v_dest:
                r, _ = db.safe_one(
                    f"SELECT count(*) FROM {T} WHERE upper({q(v_dest)}::text) LIKE '%SINGAPORE%' "
                    f"OR upper(replace({q(v_dest)}::text, ' ', '')) LIKE '%SGSIN%' "
                    f"OR upper({q(v_dest)}::text) LIKE 'SG %'"
                )
                if r:
                    print(f" Destination says Singapore: {num(r[0]):,}")
    else:
        print(" No vessels table found.")

    # Tables that keep ETAs OVER TIME (one row per ship per moment), not just the latest one.
    eta_sources = []
    for t, cols in sorted(tables.items()):
        if t == vessels:
            continue
        e = pick(cols, ["eta", "reported_eta", "eta_utc", "estimated_arrival"])
        m = pick(cols, MMSI_COLS)
        ts = time_col(cols)
        if e and m and ts:
            eta_sources.append({"table": t, "eta": e, "mmsi": m, "ts": ts, "ts_type": cols[ts],
                                "eta_type": cols[e]})

    print()
    if not eta_sources:
        print(" Tables that keep ETAs over time: NONE.")
        print(" -> The ETA a ship reported BEFORE it arrived has not been saved anywhere.")
    else:
        print(" Tables that keep ETAs over time:")
        for s in eta_sources:
            T, E, M = q(s["table"]), q(s["eta"]), q(s["mmsi"])
            filled = f"{E} IS NOT NULL" + ("" if is_time(s["eta_type"]) else f" AND trim({E}::text) <> ''")
            r, err = db.safe_one(
                f"SELECT count(*) FILTER (WHERE {filled}), count(DISTINCT {M}) FILTER (WHERE {filled}), "
                f"count(DISTINCT ({M}::text || '|' || {E}::text)) FILTER (WHERE {filled}) FROM {T}"
            )
            if err:
                print(f"   {s['table']}: could not count ({err})")
            else:
                s["rows"] = num(r[0])
                print(f"   {s['table']}: {num(r[0]):,} rows with an ETA, {num(r[1]):,} ships, "
                      f"{num(r[2]):,} different ship+ETA values")

    # ---- 4. Arrivals visible in the history
    title("4. Arrivals the position history can show")
    arrivals = {"count": 0, "ships": 0, "precise": 0, "method": None}
    if H and (H.get("status") or H.get("speed")):
        T, M, TSC = q(H["table"]), q(H["mmsi"]), q(H["ts"])
        if H.get("status"):
            stop = stopped_expr(H["status"], H["status_type"])
            method = f"status changes to moored / at anchor ({H['status']})"
            prev_ok = "prev_stop IS NOT NULL AND NOT prev_stop"
            select_stop = f"{stop} AS is_stop"
        else:
            sp = q(H["speed"])
            method = f"speed drops below 0.5 knots after moving at 2+ knots ({H['speed']})"
            select_stop = f"({sp} < 0.5) AS is_stop, ({sp} >= 2) AS moving"
            prev_ok = "prev_moving"
        lag_moving = ", lag(moving) OVER w AS prev_moving" if not H.get("status") else ""
        arrival_sql = (
            f"WITH h AS (SELECT {M} AS ship, {utc_ts(H['ts'], H['ts_type'])} AS ts, {select_stop} FROM {T} "
            f"WHERE {M} IS NOT NULL AND {TSC} IS NOT NULL), "
            f"o AS (SELECT ship, ts, is_stop, lag(is_stop) OVER w AS prev_stop, lag(ts) OVER w AS prev_ts"
            f"{lag_moving} FROM h WINDOW w AS (PARTITION BY ship ORDER BY ts)) "
            f"SELECT ship, ts, prev_ts FROM o WHERE is_stop AND {prev_ok}"
        )
        H["arrival_sql"] = arrival_sql
        r, err = db.safe_one(
            f"SELECT count(*), count(DISTINCT ship), "
            f"count(*) FILTER (WHERE ts - prev_ts <= interval '{PRECISE_GAP_HOURS} hours') "
            f"FROM ({arrival_sql}) a"
        )
        if err:
            print(f" Could not work out arrivals: {err}")
        else:
            arrivals = {"count": num(r[0]), "ships": num(r[1]), "precise": num(r[2]), "method": method}
            print(f" How an arrival is detected: {method}")
            print(f" Arrivals seen:       {arrivals['count']:,}  ({arrivals['ships']:,} different ships)")
            print(f" With a precise time: {arrivals['precise']:,}  "
                  f"(previous position at most {PRECISE_GAP_HOURS} hours earlier)")
            if hist_days:
                print(f" Arrivals per day:    {arrivals['count'] / hist_days:.1f} on average")
    elif not H:
        print(" Cannot detect arrivals: no readable position history.")
    else:
        print(" Cannot detect arrivals: the history has no status and no speed column.")

    # ---- 5. Arrivals that also have an ETA saved before arrival
    title("5. Training examples (arrival + ETA saved before it)")
    usable = 0
    usable_source = None
    if not H.get("arrival_sql"):
        print(" 0 - no arrivals can be detected.")
    elif not eta_sources:
        print(" 0 - no ETA was saved before any arrival (see section 3).")
    else:
        for s in eta_sources:
            T2, E2, M2 = q(s["table"]), q(s["eta"]), q(s["mmsi"])
            TS2 = utc_ts(s["ts"], s["ts_type"], alias="e")
            filled = f"e.{E2} IS NOT NULL" + ("" if is_time(s["eta_type"]) else f" AND trim(e.{E2}::text) <> ''")
            r, err = db.safe_one(
                f"SELECT count(*) FROM ({H['arrival_sql']}) a WHERE EXISTS ("
                f"SELECT 1 FROM {T2} e WHERE e.{M2}::text = a.ship::text AND {filled} "
                f"AND {TS2} < a.ts AND {TS2} >= a.ts - interval '{ETA_LOOKBACK_HOURS} hours')"
            )
            if err:
                print(f" {s['table']}: could not check ({err})")
                continue
            n = num(r[0])
            print(f" Using ETAs from {s['table']}: {n:,} arrivals have an ETA saved "
                  f"in the {ETA_LOOKBACK_HOURS} hours before arrival")
            if n > usable:
                usable, usable_source = n, s["table"]

    # ---- 6. Port-call events
    title("6. Port-call events")
    pc_tables = [t for t in sorted(tables) if "port_call" in t]
    if not pc_tables:
        print(" No port-call table found.")
    for t in pc_tables:
        cols = tables[t]
        ts = time_col(cols)
        r, err = db.safe_one(
            f"SELECT count(*)"
            + (f", {fmt_ts(f'min({sg_ts(ts, cols[ts])})')}, {fmt_ts(f'max({sg_ts(ts, cols[ts])})')}" if ts else "")
            + f" FROM {q(t)}"
        )
        if err:
            print(f" {t}: could not count ({err})")
            continue
        line = f" {t}: {num(r[0]):,} rows"
        if ts:
            line += f", {show(r[1])} -> {show(r[2])}"
        print(line)
        for gcol in [c for c in cols if any(k in c for k in ("locode", "port_code", "event_type", "port_name"))]:
            g, gerr = db.safe_one(
                f"SELECT string_agg(v || ' = ' || n, ', ') FROM (SELECT coalesce({q(gcol)}::text, '(empty)') v, "
                f"count(*) n FROM {q(t)} GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x"
            )
            if not gerr and g and g[0]:
                print(f"   by {gcol}: {g[0]}")

    # ---- verdict
    print()
    print("=" * 66)
    print(" VERDICT")
    print("=" * 66)
    if usable >= NEEDED_ARRIVALS:
        print(f" CAN TRAIN NOW: {usable:,} arrivals have a reported ETA saved before arrival")
        print(f" (from {usable_source}). {NEEDED_ARRIVALS} are needed for an honest train/test check.")
    else:
        print(f" CANNOT TRAIN YET: {usable:,} usable arrivals, {NEEDED_ARRIVALS} needed.")
        if not eta_sources:
            print(" Reason: the ETA each ship reported is overwritten on every sync;")
            print(" no ETA from before an arrival is kept. Next step: start saving ETA snapshots.")
        elif not H.get("arrival_sql"):
            print(" Reason: arrivals cannot be detected from the saved positions.")
        else:
            print(" Reason: not enough arrivals with an ETA saved before them yet.")
        if arrivals["count"] and hist_days:
            per_day = arrivals["count"] / hist_days
            if per_day > 0:
                days = -(-(NEEDED_ARRIVALS - usable) // max(per_day, 0.01))
                print(f" At the current {per_day:.1f} detected arrivals per day, about {int(days)} more days")
                print(" of saved ETA snapshots are needed (if every arriving ship has an ETA).")
    print()
    print(" Copy everything above and paste it into the chat.")


if __name__ == "__main__":
    main()