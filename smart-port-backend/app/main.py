import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware

from app.api.dependencies import (
    get_db,
    require_module_access,
)

from app.api.routes.auth import router as auth_router
from app.api.routes.vessels import router as vessels_router
from app.api.routes.berths import router as berths_router
from app.api.routes.cargo import router as cargo_router
from app.api.routes.trucks import router as trucks_router
from app.api.routes.roles import router as roles_router
from app.api.routes.presence import router as presence_router
from app.api.routes.users import router as users_router
from app.api.routes.ais import router as ais_router
from app.api.routes.weather import router as weather_router
from app.api.routes.port_calls import router as port_calls_router
from app.api.routes.chat import router as chat_router
from app.api.routes.notifications import router as notifications_router
from app.api.routes.incidents import router as incidents_router
from app.api.routes.assets import router as assets_router
from app.api.routes.documents import router as documents_router
from app.api.routes.audit import router as audit_router
from app.api.routes.predictions import router as predictions_router
from app.models.role import Role

from app.services.ais_service import (
    AISConfigurationError,
    start_ais_background_listener,
    stop_ais_background_listener,
)
from app.services import audit_service
from app.services.aisstream_collector import (
    start_aisstream_collector,
    stop_aisstream_collector,
)


# =========================================================
# FIXED PORT SYSTEM ROLES
# =========================================================

FIXED_SYSTEM_ROLES = [
    "Port Administrator",
    "Port Operations Manager",
    "Vessel Management Officer",
    "Security Officer",
    "Gate & Truck Officer",
    "Maintenance Officer",
    "Cargo Officer",
    "Port Executive",
]


# =========================================================
# ENSURE FIXED SYSTEM ROLES EXIST
# =========================================================

def ensure_fixed_system_roles(db: Session) -> None:
    """
    Ensure that all eight fixed Port system roles
    exist in PostgreSQL.

    Existing roles are preserved.
    Existing role IDs are preserved.
    Existing permissions are preserved.

    This function performs database work and therefore
    must not block FastAPI application startup.
    """

    existing_roles = list(
        db.scalars(
            select(Role)
        ).all()
    )

    existing_role_names = {
        role.name.strip().lower()
        for role in existing_roles
        if role.name
    }

    roles_created = False

    for role_name in FIXED_SYSTEM_ROLES:

        normalized_name = role_name.strip().lower()

        if normalized_name in existing_role_names:
            continue

        role = Role(
            name=role_name,
        )

        db.add(role)

        roles_created = True

    if roles_created:
        db.commit()


# =========================================================
# AUDIT LOGS BELONG TO TWO ROLES
# =========================================================

def ensure_audit_log_access(db: Session) -> list[str]:
    """
    Audit Logs are only for the Port Administrator and the Port
    Executive. The server refuses everybody else on its own; this
    step makes the menu match:

      * the Port Executive gets the "audit_logs" feature (the Port
        Administrator always has every feature);
      * any other role that still has it loses it.

    Nothing else about any role is changed. Returns a short line for
    every role that was changed.
    """

    from app.services import role_service

    changed: list[str] = []

    for role in role_service.get_all_roles(db):

        if role_service.is_admin_role(role):
            continue

        allowed = audit_service.is_oversight_name(role.name)

        keys = role_service.get_role_permission_keys(db, role.id)

        has_feature = "audit_logs" in keys

        if allowed and not has_feature:

            role_service.update_role_permissions(
                db, role.id, keys + ["audit_logs"]
            )

            changed.append(f"{role.name}: Audit Logs added")

        elif not allowed and has_feature:

            role_service.update_role_permissions(
                db, role.id, [key for key in keys if key != "audit_logs"]
            )

            changed.append(f"{role.name}: Audit Logs removed")

    return changed


# =========================================================
# BACKGROUND RBAC INITIALIZATION
# =========================================================

async def initialize_rbac_roles():
    """
    Initialize the eight fixed system roles in a background
    thread so PostgreSQL connectivity cannot block FastAPI
    application startup.
    """

    db_generator = get_db()
    db = None

    try:

        db = await asyncio.to_thread(
            next,
            db_generator,
        )

        await asyncio.to_thread(
            ensure_fixed_system_roles,
            db,
        )

        print(
            "Fixed RBAC system roles verified successfully."
        )

        # Audit Logs: Port Administrator and Port Executive only.
        # A problem here must never stop the rest of the start-up.
        try:

            changed = await asyncio.to_thread(
                ensure_audit_log_access,
                db,
            )

            print(
                "Audit Logs access verified"
                + (
                    " (" + "; ".join(changed) + ")."
                    if changed
                    else "."
                )
            )

        except Exception as exc:

            try:
                await asyncio.to_thread(db.rollback)
            except Exception:
                pass

            print(
                "Audit Logs access check error: "
                f"{type(exc).__name__}: {exc}"
            )

    except Exception as exc:

        if db is not None:
            try:
                await asyncio.to_thread(
                    db.rollback
                )
            except Exception:
                pass

        print(
            "RBAC system role initialization error: "
            f"{type(exc).__name__}: {exc}"
        )

    finally:

        if db is not None:
            try:
                await asyncio.to_thread(
                    db.close
                )
            except Exception:
                pass

        try:
            db_generator.close()
        except Exception:
            pass


# =========================================================
# BACKGROUND AIS INITIALIZATION
# =========================================================

async def initialize_ais_listener():
    """
    Start the AIS listener independently from FastAPI
    application startup.

    AIS connectivity must never prevent the API from
    becoming available.
    """

    try:

        await asyncio.sleep(0)

        start_ais_background_listener()

        print(
            "AIS background listener started successfully."
        )

    except AISConfigurationError as exc:

        print(
            f"AIS background listener not started: {exc}"
        )

    except Exception as exc:

        print(
            "AIS background listener startup error: "
            f"{type(exc).__name__}: {exc}"
        )


# =========================================================
# APPLICATION LIFESPAN
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # -----------------------------------------------------
    # STARTUP
    # -----------------------------------------------------

    # IMPORTANT:
    #
    # Do NOT wait for PostgreSQL role initialization here.
    # Do NOT wait for AIS connectivity here.
    #
    # Both are launched as background tasks so that:
    #
    # FastAPI
    #    v
    # Application startup complete
    #    v
    # API becomes available
    #    v
    # RBAC/AIS initialize independently

    rbac_task = asyncio.create_task(
        initialize_rbac_roles()
    )

    ais_task = asyncio.create_task(
        initialize_ais_listener()
    )

    # Free AISStream feed: ETAs and arrivals for Predict Vessel Delay.
    # A problem here must never stop the rest of the start-up.
    try:

        start_aisstream_collector()

    except Exception as exc:

        print(
            "AISStream collector startup error: "
            f"{type(exc).__name__}: {exc}"
        )

    # -----------------------------------------------------
    # APPLICATION RUNNING
    # -----------------------------------------------------

    yield

    # -----------------------------------------------------
    # SHUTDOWN
    # -----------------------------------------------------

    # Stop the AISStream collector (it saves what it still holds).

    try:

        await stop_aisstream_collector()

        print(
            "AISStream collector stopped."
        )

    except Exception as exc:

        print(
            "AISStream collector shutdown error: "
            f"{type(exc).__name__}: {exc}"
        )

    # Then stop the AIS listener.

    try:

        await stop_ais_background_listener()

        print(
            "AIS background listener stopped."
        )

    except Exception as exc:

        print(
            "AIS background listener shutdown error: "
            f"{type(exc).__name__}: {exc}"
        )

    # -----------------------------------------------------
    # CLEANUP STARTUP TASKS
    # -----------------------------------------------------

    for task in (
        rbac_task,
        ais_task,
    ):

        if not task.done():

            task.cancel()

            try:
                await task
            except asyncio.CancelledError:
                pass


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="Port of Singapore Smart Sea Port Management System",
    description=(
        "Smart Sea Port Management "
        "and Monitoring System for the Port of Singapore"
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# =========================================================
# UNEXPECTED ERRORS STAY READABLE
# =========================================================
#
# When a route crashes, FastAPI answers with a plain "500" page
# that has NO CORS headers. The browser then hides that answer
# and the screen only says "Unable to connect to the ... backend".
#
# This catches the crash, writes the full error in the backend
# window, and answers with a short JSON message that the screen
# can show. It is added BEFORE the CORS middleware on purpose,
# so the CORS headers are still added to that answer.

logger = logging.getLogger(__name__)


async def keep_errors_readable(request: Request, call_next):

    try:
        return await call_next(request)

    except Exception as exc:

        logger.exception(
            "Unhandled error in %s %s",
            request.method,
            request.url.path,
        )

        reason = (str(exc).strip().splitlines() or [""])[0][:160]

        detail = (
            "The server hit an unexpected error "
            f"({type(exc).__name__})"
        )

        if reason:
            detail += f": {reason}"

        return JSONResponse(
            status_code=500,
            content={
                "detail": (
                    detail
                    + ". The backend window shows the details."
                )
            },
        )


app.add_middleware(
    BaseHTTPMiddleware,
    dispatch=keep_errors_readable,
)


# =========================================================
# THE AUDIT LOG RECORDS EVERY CHANGE
# =========================================================
#
# Every request that CHANGES data (POST, PUT, PATCH, DELETE) is
# written to the Audit Log: who did it, in which module, what it
# was, which record it touched and whether it worked. This one
# place covers every module (also modules added later), so no
# module has to be edited. The Audit Log itself, documents, chat,
# notifications and sign-in have their own rules (see
# app/services/audit_service.py).
#
# It is added AFTER keep_errors_readable on purpose: a crashed
# request then arrives here as the readable 500 answer and is
# recorded as "Failed". Recording never stops a request: any
# problem is only logged.

AUDIT_BODY_PATHS = ("/users", "/roles")

AUDIT_MAX_BODY_BYTES = 20000


async def _small_json_body(request: Request):
    """The JSON body of a small request (accounts and roles only)."""

    try:

        raw = await request.body()

        # Newer Starlette hands a body that was read here on to the
        # route by itself. Older versions need it given back.
        if not hasattr(request, "wrapped_receive"):

            original = request._receive

            handed_back = False

            async def replay():

                nonlocal handed_back

                if not handed_back:

                    handed_back = True

                    return {
                        "type": "http.request",
                        "body": raw,
                        "more_body": False,
                    }

                return await original()

            request._receive = replay

        if not raw or len(raw) > AUDIT_MAX_BODY_BYTES:
            return None

        data = json.loads(raw)

        return data if isinstance(data, dict) else None

    except Exception:

        return None


async def record_changes(request: Request, call_next):

    state = None

    try:

        path = request.url.path

        if audit_service.describe(request.method, path) is not None:

            ip, device = audit_service.client_of(request)

            info = {
                "method": request.method,
                "path": path,
                "authorization": request.headers.get("authorization"),
                "ip": ip,
                "device": device,
                "body": None,
            }

            if path.startswith(AUDIT_BODY_PATHS) and not path.startswith(
                "/users/me"
            ):
                info["body"] = await _small_json_body(request)

            state = await run_in_threadpool(
                audit_service.start_request,
                info,
            )

    except Exception:

        logger.warning(
            "The audit recorder could not prepare a request.",
            exc_info=True,
        )

    response = await call_next(request)

    if state is not None:

        try:

            await run_in_threadpool(
                audit_service.finish_request,
                state,
                response.status_code,
            )

        except Exception:

            logger.warning(
                "The audit recorder could not finish a request.",
                exc_info=True,
            )

    return response


app.add_middleware(
    BaseHTTPMiddleware,
    dispatch=record_changes,
)


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# FEATURE GUARD FOR WHOLE ROUTERS
# =========================================================

def module_guard(module_key: str, *also_read: str):
    """
    Protect every endpoint of a router with one feature.

    CHANGING data (POST, PUT, PATCH, DELETE) needs
    `module_key` itself.

    READING data (GET) needs `module_key` or one of the
    related features in `also_read` (the Dashboard shows
    figures from several modules).

    A role with ZERO features is refused everywhere.
    """

    return [
        Depends(
            require_module_access(
                module_key,
                also_read=also_read,
            )
        )
    ]


# =========================================================
# API ROUTES
# =========================================================

# Open to a valid login only on purpose:
#   auth (login, own profile), presence (online status)
# Protected inside their own files:
#   roles, users (Port Administrator only)
#   trucks (gate_trucks feature)

app.include_router(auth_router)
app.include_router(roles_router)
app.include_router(users_router)
app.include_router(presence_router)
app.include_router(trucks_router)

app.include_router(
    vessels_router,
    dependencies=module_guard(
        "vessels",
        "dashboard", "port_map", "berths", "cargo",
        "gate_trucks", "analytics",
    ),
)

app.include_router(
    berths_router,
    dependencies=module_guard(
        "berths",
        "dashboard", "port_map", "vessels", "cargo",
        "analytics",
    ),
)

from app.api.routes import throughput as throughput_routes
app.include_router(
    throughput_routes.router,
    dependencies=module_guard(
        "cargo",
        "dashboard", "analytics",
    ),
)

app.include_router(
    cargo_router,
    dependencies=module_guard(
        "cargo",
        "dashboard", "vessels", "berths", "gate_trucks",
        "analytics",
    ),
)

app.include_router(
    ais_router,
    dependencies=module_guard(
        "vessels",
        "dashboard", "port_map", "berths", "analytics",
    ),
)

app.include_router(
    weather_router,
    dependencies=module_guard(
        "weather",
        "dashboard", "port_map", "vessels", "berths",
        "port_alerts", "asset_maintenance", "analytics",
    ),
)

app.include_router(
    port_calls_router,
    dependencies=module_guard(
        "vessels",
        "dashboard", "port_map", "berths", "analytics",
    ),
)

# Port Communication (chat). The "port_communication" feature is
# required. Notifications are open to every logged-in account (the
# bell shows on every page); each account only ever sees its own.
app.include_router(
    chat_router,
    dependencies=module_guard("port_communication"),
)

app.include_router(notifications_router)

# Incident Management. The "incidents" feature is required to
# change data; reading is also allowed with the features that show
# incident figures (Dashboard, Port Alerts, Port Map, Analytics).
app.include_router(
    incidents_router,
    dependencies=module_guard(
        "incidents",
        "dashboard", "port_alerts", "port_map", "analytics",
    ),
)

# Asset & Maintenance. The "asset_maintenance" feature is required to
# change data; reading is also allowed with the features that show
# equipment figures (Dashboard, Port Alerts, Analytics).
app.include_router(
    assets_router,
    dependencies=module_guard(
        "asset_maintenance",
        "dashboard", "port_alerts", "analytics",
    ),
)

# Document Management. The "documents" feature is required for every
# endpoint. Who may see or change a single document is decided
# inside the document service (restricted documents, uploader and
# Port Administrator).
app.include_router(
    documents_router,
    dependencies=module_guard("documents"),
)

# Delay Prediction (machine learning). Same people as Port Analytics.
app.include_router(
    predictions_router,
    dependencies=module_guard("analytics"),
)

# Audit Logs (read only). Only the Port Administrator and the Port
# Executive may read it. The routes check the role themselves
# (audit_service.require_oversight), whatever features a role has.
app.include_router(audit_router)

# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health_check():

    return {
        "status": "ok",
        "service": (
            "Port of Singapore Smart Sea Port "
            "Management System"
        ),
    }