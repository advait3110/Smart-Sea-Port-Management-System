"""
SEED THE 8 FIXED ROLES + THE FIRST PORT ADMINISTRATOR

There are NO demo accounts and NO demo passwords here.

What this script does
---------------------
1. Makes sure the 8 FIXED ROLES exist in PostgreSQL.
   A role that already exists is NOT changed, so any feature
   changes made in User & Role Management are kept.
   A role that is missing is created with its default features.
   The Port Administrator role always has all 16 features.

2. If there is no active Port Administrator yet, asks you for
   the Admin ID, full name and password of the first one.
   The password is typed on the keyboard (it is not shown)
   and is never stored in this file.

3. Prints every role with its features and every employee
   account, so you can see exactly what is in the database.

Nothing is ever deleted by this script.

Further roles
-------------
Any other role (for example "Harbour Pilot") is created by the
Port Administrator in User & Role Management. A new role starts
with ZERO features. The administrator then ticks any of the 16
FEATURES listed below for it. The list is printed at the end of
every run.

How to run (from the smart-port-backend folder, with the
virtual environment active):

    python -m app.scripts.seed_users

To only LOOK at the roles and accounts, without changing
anything:

    python -m app.scripts.seed_users --show
"""

import getpass
import sys
from pathlib import Path

# Lets "import app..." work however this file is started.
for _folder in Path(__file__).resolve().parents:
    if (_folder / "app" / "core").is_dir():
        if str(_folder) not in sys.path:
            sys.path.insert(0, str(_folder))
        break

from app.core.database import SessionLocal  # noqa: E402
from app.services.role_service import (  # noqa: E402
    create_role,
    get_all_roles,
    get_role_permission_keys,
    update_role_permissions,
)
from app.services.user_service import (  # noqa: E402
    create_user,
    get_all_users,
)


# =========================================================
# THE 16 FEATURES (a role is given features, never names)
# =========================================================
#
# These keys are the same ones used by the backend
# (require_module_permission) and by the frontend
# (permissions.js). A role can be given any of them.
#

FEATURES = [
    ("dashboard", "Dashboard",
     "Main overview of port operations"),
    ("port_map", "Port Map",
     "Map of the port area and vessels"),
    ("weather", "Weather",
     "Weather and sea conditions"),
    ("vessels", "Vessels",
     "Vessel list, details and arrivals"),
    ("berths", "Berths",
     "Berth status and allocation"),
    ("cargo", "Cargo Operations",
     "Cargo operations and cargo throughput"),
    ("gate_trucks", "Gate & Trucks",
     "Gate entries and truck movements"),
    ("port_communication", "Port Communication",
     "Messages between port teams"),
    ("notifications", "Notifications",
     "Notifications for the logged-in employee"),
    ("port_alerts", "Port Alerts",
     "Safety and operational alerts"),
    ("incidents", "Incidents",
     "Incident reports and follow-up"),
    ("asset_maintenance", "Asset Maintenance",
     "Equipment and asset maintenance jobs"),
    ("analytics", "Analytics",
     "Reports, charts and statistics"),
    ("documents", "Documents",
     "Port documents and files"),
    ("audit_logs", "Audit Logs",
     "Record of who did what"),
    ("user_role_management", "User & Role Management",
     "Employee accounts, roles and role features"),
]

ALL_FEATURE_KEYS = [key for key, _, _ in FEATURES]


# =========================================================
# THE 8 FIXED ROLES
# =========================================================
#
# "features" is only used when the role has to be CREATED
# (for example on a brand-new database). They match the role
# design in permissions.js. After that, the Port Administrator
# changes them in User & Role Management.
#

ADMIN_ROLE = "Port Administrator"

FIXED_ROLES = [
    {
        "name": ADMIN_ROLE,
        "description": (
            "Full access, including users, roles and "
            "role features."
        ),
        "features": ALL_FEATURE_KEYS,
    },
    {
        "name": "Port Operations Manager",
        "description": (
            "Oversees daily port operations across "
            "vessels, berths, cargo and gates."
        ),
        "features": [
            "dashboard", "port_map", "weather", "vessels",
            "berths", "cargo", "gate_trucks",
            "port_communication", "notifications",
            "port_alerts", "incidents", "asset_maintenance",
            "analytics", "documents",
        ],
    },
    {
        "name": "Vessel Management Officer",
        "description": (
            "Manages vessel arrivals, departures and "
            "berth allocation."
        ),
        "features": [
            "dashboard", "port_map", "weather", "vessels",
            "berths", "port_communication", "notifications",
            "port_alerts", "incidents", "analytics",
            "documents",
        ],
    },
    {
        "name": "Cargo Officer",
        "description": "Manages cargo operations.",
        "features": [
            "dashboard", "port_map", "vessels", "berths",
            "cargo", "gate_trucks", "port_communication",
            "notifications", "port_alerts", "incidents",
            "analytics", "documents",
        ],
    },
    {
        "name": "Gate & Truck Officer",
        "description": (
            "Manages gate entries and truck movements."
        ),
        "features": [
            "dashboard", "port_map", "vessels", "cargo",
            "gate_trucks", "port_communication",
            "notifications", "port_alerts", "incidents",
            "documents",
        ],
    },
    {
        "name": "Security Officer",
        "description": (
            "Handles port security, alerts and incidents."
        ),
        "features": [
            "dashboard", "port_map", "vessels", "gate_trucks",
            "port_communication", "notifications",
            "port_alerts", "incidents", "documents",
            "audit_logs",
        ],
    },
    {
        "name": "Maintenance Officer",
        "description": (
            "Manages equipment and asset maintenance."
        ),
        "features": [
            "dashboard", "port_map", "weather",
            "port_communication", "notifications",
            "port_alerts", "incidents", "asset_maintenance",
            "analytics", "documents",
        ],
    },
    {
        "name": "Port Executive",
        "description": (
            "Senior management view of port performance."
        ),
        "features": [
            "dashboard", "port_map", "vessels", "berths",
            "cargo", "gate_trucks", "port_communication",
            "notifications", "port_alerts", "incidents",
            "analytics", "documents",
        ],
    },
]

FIXED_ROLE_NAMES = [role["name"] for role in FIXED_ROLES]


# =========================================================
# STEP 1: FIXED ROLES
# =========================================================

def ensure_fixed_roles(db):
    print("STEP 1 - The 8 fixed roles")

    roles = {role.name: role for role in get_all_roles(db)}

    for spec in FIXED_ROLES:
        role = roles.get(spec["name"])

        if role is None:
            role = create_role(
                db=db,
                name=spec["name"],
                description=spec["description"],
            )

            update_role_permissions(
                db=db,
                role_id=role.id,
                permission_keys=spec["features"],
            )

            print(
                f"   created  {spec['name']} "
                f"({len(spec['features'])} features)"
            )
            continue

        if spec["name"] == ADMIN_ROLE:
            have = set(get_role_permission_keys(db, role.id))
            missing = [
                key for key in ALL_FEATURE_KEYS
                if key not in have
            ]

            if missing:
                update_role_permissions(
                    db=db,
                    role_id=role.id,
                    permission_keys=ALL_FEATURE_KEYS,
                )

                print(
                    f"   fixed    {spec['name']} "
                    f"(gave back {len(missing)} missing "
                    "features)"
                )
                continue

        print(f"   exists   {spec['name']} (not changed)")

    print()


# =========================================================
# STEP 2: FIRST PORT ADMINISTRATOR
# =========================================================

def ask_for_administrator():
    if not sys.stdin.isatty():
        print(
            "   This window cannot ask questions. "
            "Run the script from a normal terminal."
        )
        return None

    print("   There is no active Port Administrator yet.")
    print("   Enter the details of the first one.")

    admin_id = input("   Admin ID (login name): ").strip()
    full_name = input("   Full name: ").strip()

    if not admin_id or not full_name:
        print("   Admin ID and full name cannot be empty.")
        return None

    for _ in range(3):
        password = getpass.getpass(
            "   Password (at least 8 characters): "
        )
        again = getpass.getpass(
            "   Type the password again: "
        )

        if len(password) < 8:
            print("   Too short. Please try again.")
            continue

        if password != again:
            print("   The two passwords are different.")
            continue

        return admin_id, full_name, password

    print("   No valid password was entered.")
    return None


def ensure_first_administrator(db):
    print("STEP 2 - First Port Administrator")

    administrators = [
        user for user in get_all_users(db)
        if user.is_active
        and user.role is not None
        and user.role.name == ADMIN_ROLE
    ]

    if administrators:
        names = ", ".join(user.username for user in administrators)
        print(f"   exists   {names} (nothing to create)")
        print()
        return

    details = ask_for_administrator()

    if details is None:
        print("   skipped  no administrator was created")
        print()
        return

    admin_id, full_name, password = details

    create_user(
        db=db,
        name=full_name,
        admin_id=admin_id,
        password=password,
        role_name=ADMIN_ROLE,
    )

    print(f"   created  {admin_id} ({ADMIN_ROLE})")
    print()


# =========================================================
# STEP 3: REPORT
# =========================================================

def show_report(db):
    print("ROLES AND THEIR FEATURES")

    roles = sorted(get_all_roles(db), key=lambda role: role.name)

    fixed = [r for r in roles if r.name in FIXED_ROLE_NAMES]
    other = [r for r in roles if r.name not in FIXED_ROLE_NAMES]

    def print_role(role):
        keys = sorted(get_role_permission_keys(db, role.id))
        listing = ", ".join(keys) if keys else "(no features)"
        print(f"   {role.name} - {len(keys)} features")
        print(f"      {listing}")

    print("  Fixed roles:")
    for role in fixed:
        print_role(role)

    missing = [n for n in FIXED_ROLE_NAMES
               if n not in {r.name for r in fixed}]
    for name in missing:
        print(f"   {name} - MISSING (run without --show)")

    print("  Other roles (created by the administrator):")
    if other:
        for role in other:
            print_role(role)
    else:
        print("   none")

    print()
    print("EMPLOYEE ACCOUNTS")

    users = get_all_users(db)

    if not users:
        print("   none")

    for user in users:
        role_name = user.role.name if user.role else "(no role)"
        state = "active" if user.is_active else "inactive"
        print(f"   {user.username:<20} {role_name:<28} {state}")

    print()
    print("FEATURES THAT CAN BE GIVEN TO ANY ROLE")

    for key, label, meaning in FEATURES:
        print(f"   {key:<22} {label} - {meaning}")

    print()


# =========================================================
# MAIN
# =========================================================

def main():
    show_only = "--show" in sys.argv

    db = SessionLocal()

    try:
        print()

        if not show_only:
            ensure_fixed_roles(db)
            ensure_first_administrator(db)

        show_report(db)

    except Exception as error:
        db.rollback()

        print()
        print("FAILED:", error)

        raise SystemExit(1) from error

    finally:
        db.close()


if __name__ == "__main__":
    main()