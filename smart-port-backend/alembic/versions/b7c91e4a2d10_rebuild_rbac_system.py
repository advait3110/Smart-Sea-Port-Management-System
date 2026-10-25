"""Rebuild the Karwar Port RBAC system.

Revision ID: b7c91e4a2d10
Revises: a532f552bbc6
Create Date: 2026-10-04
"""

from alembic import op
import sqlalchemy as sa


# =========================================================
# MIGRATION IDENTIFIERS
# =========================================================

revision = "b7c91e4a2d10"

down_revision = "a532f552bbc6"

branch_labels = None

depends_on = None


# =========================================================
# FINAL SYSTEM ROLES
# =========================================================

FINAL_ROLES = [
    (
        "Port Administrator",
        "Full administrative access to the Karwar Port management system.",
    ),
    (
        "Port Operations Manager",
        "Manages core port operations and operational coordination.",
    ),
    (
        "Vessel Management Officer",
        "Manages vessel and berth related operations.",
    ),
    (
        "Cargo Officer",
        "Manages cargo and cargo-related operational activities.",
    ),
    (
        "Gate & Truck Officer",
        "Manages gate operations, truck movements and related activities.",
    ),
    (
        "Security Officer",
        "Manages security, alerts and incident-related activities.",
    ),
    (
        "Maintenance Officer",
        "Manages assets, maintenance and maintenance-related incidents.",
    ),
    (
        "Port Executive",
        "Provides executive-level visibility into port operations and analytics.",
    ),
]


# =========================================================
# OLD ROLE → NEW ROLE
# =========================================================

OLD_ROLE_MAPPING = {
    "admin": "Port Administrator",
    "port_operations_officer": "Port Operations Manager",
    "marine_officer": "Vessel Management Officer",
    "security_officer": "Security Officer",
    "gate_truck_officer": "Gate & Truck Officer",
    "maintenance_officer": "Maintenance Officer",
    "cargo_officer": "Cargo Officer",
}


# =========================================================
# USER-SPECIFIC CORRECTIONS
# =========================================================
#
# These correct the existing development accounts whose
# current role does not match their intended employee role.
#
# Existing users:
#
# portadmin   → Port Administrator
# vesseladmin → Vessel Management Officer
# marine      → Vessel Management Officer
# manager     → Port Operations Manager
# cargo       → Cargo Officer
# gate        → Gate & Truck Officer
# maintenance → Maintenance Officer
# executive   → Port Executive
#
# admin       → Port Administrator
# =========================================================

USER_ROLE_MAPPING = {
    "portadmin": "Port Administrator",
    "vesseladmin": "Vessel Management Officer",
    "admin": "Port Administrator",
    "marine": "Vessel Management Officer",
    "manager": "Port Operations Manager",
    "cargo": "Cargo Officer",
    "gate": "Gate & Truck Officer",
    "maintenance": "Maintenance Officer",
    "executive": "Port Executive",
}


# =========================================================
# FINAL PERMISSIONS
# =========================================================
#
# These are MODULE-LEVEL permissions.
#
# PostgreSQL is the source of truth.
#
# The frontend will eventually consume these exact keys.
# =========================================================

PERMISSIONS = [
    (
        "dashboard",
        "Port Dashboard",
        "Access the main port dashboard.",
    ),
    (
        "port_map",
        "Live Port Map",
        "Access the live port map.",
    ),
    (
        "weather",
        "Weather & Marine Conditions",
        "Access weather and marine condition information.",
    ),
    (
        "vessels",
        "Vessel Management",
        "Access vessel management.",
    ),
    (
        "berths",
        "Berth Management",
        "Access berth management.",
    ),
    (
        "cargo",
        "Cargo Operations",
        "Access cargo operations.",
    ),
    (
        "gate_trucks",
        "Gate & Truck Management",
        "Access gate and truck management.",
    ),
    (
        "port_communication",
        "Port Communication",
        "Access port communication.",
    ),
    (
        "notifications",
        "Notifications",
        "Access notifications.",
    ),
    (
        "port_alerts",
        "Port Alerts",
        "Access port alerts.",
    ),
    (
        "incidents",
        "Incident Management",
        "Access incident management.",
    ),
    (
        "asset_maintenance",
        "Asset & Maintenance",
        "Access asset and maintenance management.",
    ),
    (
        "analytics",
        "Port Analytics",
        "Access port analytics.",
    ),
    (
        "documents",
        "Document Management",
        "Access document management.",
    ),
    (
        "audit_logs",
        "Audit Logs",
        "Access audit logs.",
    ),
    (
        "user_role_management",
        "User & Role Management",
        "Manage employees, roles and permissions.",
    ),
]


# =========================================================
# DEFAULT ROLE PERMISSIONS
# =========================================================
#
# Port Administrator receives ALL permissions.
#
# Other roles receive only the modules relevant to their
# normal responsibilities.
#
# These are INITIAL permissions only.
#
# After this migration, the Port Administrator can change
# role permissions through the User & Role Management UI.
# =========================================================

ROLE_PERMISSIONS = {
    "Port Administrator": [
        "dashboard",
        "port_map",
        "weather",
        "vessels",
        "berths",
        "cargo",
        "gate_trucks",
        "port_communication",
        "notifications",
        "port_alerts",
        "incidents",
        "asset_maintenance",
        "analytics",
        "documents",
        "audit_logs",
        "user_role_management",
    ],

    "Port Operations Manager": [
        "dashboard",
        "port_map",
        "weather",
        "vessels",
        "berths",
        "cargo",
        "gate_trucks",
        "port_communication",
        "notifications",
        "port_alerts",
        "incidents",
        "asset_maintenance",
        "analytics",
        "documents",
        "audit_logs",
    ],

    "Vessel Management Officer": [
        "dashboard",
        "port_map",
        "weather",
        "vessels",
        "berths",
        "notifications",
        "port_alerts",
        "analytics",
    ],

    "Cargo Officer": [
        "dashboard",
        "port_map",
        "vessels",
        "cargo",
        "gate_trucks",
        "notifications",
        "port_alerts",
        "analytics",
        "documents",
    ],

    "Gate & Truck Officer": [
        "dashboard",
        "port_map",
        "cargo",
        "gate_trucks",
        "notifications",
        "port_alerts",
    ],

    "Security Officer": [
        "dashboard",
        "port_map",
        "port_communication",
        "notifications",
        "port_alerts",
        "incidents",
        "audit_logs",
    ],

    "Maintenance Officer": [
        "dashboard",
        "port_map",
        "notifications",
        "port_alerts",
        "incidents",
        "asset_maintenance",
        "analytics",
    ],

    "Port Executive": [
        "dashboard",
        "port_map",
        "weather",
        "vessels",
        "berths",
        "cargo",
        "gate_trucks",
        "port_communication",
        "notifications",
        "port_alerts",
        "incidents",
        "asset_maintenance",
        "analytics",
        "documents",
        "audit_logs",
    ],
}


# =========================================================
# UPGRADE
# =========================================================

def upgrade() -> None:
    bind = op.get_bind()

    # -----------------------------------------------------
    # 1. Load existing tables
    # -----------------------------------------------------

    roles_table = sa.table(
        "roles",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
    )

    users_table = sa.table(
        "users",
        sa.column("id", sa.Integer),
        sa.column("username", sa.String),
        sa.column("role_id", sa.Integer),
    )

    permissions_table = sa.table(
        "permissions",
        sa.column("id", sa.Integer),
        sa.column("key", sa.String),
        sa.column("name", sa.String),
        sa.column("description", sa.String),
    )

    role_permissions_table = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer),
        sa.column("permission_id", sa.Integer),
    )

    # -----------------------------------------------------
    # 2. Rename existing roles into the new role system.
    #
    # We rename existing records instead of deleting them.
    # This preserves existing foreign-key references.
    # -----------------------------------------------------

    for old_name, new_name in OLD_ROLE_MAPPING.items():

        existing_role = bind.execute(
            sa.select(
                roles_table.c.id
            ).where(
                roles_table.c.name == old_name
            )
        ).first()

        if existing_role:

            description = next(
                (
                    role_description
                    for role_name, role_description
                    in FINAL_ROLES
                    if role_name == new_name
                ),
                None,
            )

            bind.execute(
                roles_table.update()
                .where(
                    roles_table.c.id ==
                    existing_role.id
                )
                .values(
                    name=new_name,
                    description=description,
                )
            )

    # -----------------------------------------------------
    # 3. Create missing final roles.
    # -----------------------------------------------------

    existing_role_names = {
        row.name
        for row in bind.execute(
            sa.select(
                roles_table.c.name
            )
        ).all()
    }

    for role_name, description in FINAL_ROLES:

        if role_name not in existing_role_names:

            bind.execute(
                roles_table.insert().values(
                    name=role_name,
                    description=description,
                )
            )

    # -----------------------------------------------------
    # 4. Make sure descriptions are correct.
    # -----------------------------------------------------

    for role_name, description in FINAL_ROLES:

        bind.execute(
            roles_table.update()
            .where(
                roles_table.c.name ==
                role_name
            )
            .values(
                description=description
            )
        )

    # -----------------------------------------------------
    # 5. Create all permissions.
    # -----------------------------------------------------

    existing_permissions = {
        row.key: row.id
        for row in bind.execute(
            sa.select(
                permissions_table.c.id,
                permissions_table.c.key,
            )
        ).all()
    }

    for (
        permission_key,
        permission_name,
        permission_description,
    ) in PERMISSIONS:

        if permission_key not in existing_permissions:

            result = bind.execute(
                permissions_table.insert()
                .values(
                    key=permission_key,
                    name=permission_name,
                    description=permission_description,
                )
                .returning(
                    permissions_table.c.id
                )
            )

            permission_id = result.scalar_one()

            existing_permissions[
                permission_key
            ] = permission_id

        else:

            bind.execute(
                permissions_table.update()
                .where(
                    permissions_table.c.key ==
                    permission_key
                )
                .values(
                    name=permission_name,
                    description=permission_description,
                )
            )

    # -----------------------------------------------------
    # 6. Load final role IDs.
    # -----------------------------------------------------

    role_ids = {
        row.name: row.id
        for row in bind.execute(
            sa.select(
                roles_table.c.id,
                roles_table.c.name,
            )
        ).all()
    }

    # -----------------------------------------------------
    # 7. Correct existing user role assignments.
    # -----------------------------------------------------

    for username, role_name in USER_ROLE_MAPPING.items():

        role_id = role_ids.get(role_name)

        if role_id is None:
            raise RuntimeError(
                f"Required role does not exist: {role_name}"
            )

        bind.execute(
            users_table.update()
            .where(
                users_table.c.username ==
                username
            )
            .values(
                role_id=role_id
            )
        )

    # -----------------------------------------------------
    # 8. Remove existing permission assignments.
    #
    # This is safe because the current database contains
    # zero permission links, but it also guarantees that
    # this migration produces a deterministic RBAC state.
    # -----------------------------------------------------

    bind.execute(
        role_permissions_table.delete()
    )

    # -----------------------------------------------------
    # 9. Create the final role-permission matrix.
    # -----------------------------------------------------

    for role_name, permission_keys in ROLE_PERMISSIONS.items():

        role_id = role_ids.get(role_name)

        if role_id is None:
            raise RuntimeError(
                f"Required role does not exist: {role_name}"
            )

        for permission_key in permission_keys:

            permission_id = existing_permissions.get(
                permission_key
            )

            if permission_id is None:
                raise RuntimeError(
                    "Required permission does not exist: "
                    f"{permission_key}"
                )

            bind.execute(
                role_permissions_table.insert().values(
                    role_id=role_id,
                    permission_id=permission_id,
                )
            )


# =========================================================
# DOWNGRADE
# =========================================================

def downgrade() -> None:
    bind = op.get_bind()

    roles_table = sa.table(
        "roles",
        sa.column("id", sa.Integer),
        sa.column("name", sa.String),
    )

    users_table = sa.table(
        "users",
        sa.column("username", sa.String),
        sa.column("role_id", sa.Integer),
    )

    permissions_table = sa.table(
        "permissions",
        sa.column("id", sa.Integer),
        sa.column("key", sa.String),
    )

    role_permissions_table = sa.table(
        "role_permissions",
        sa.column("role_id", sa.Integer),
        sa.column("permission_id", sa.Integer),
    )

    # -----------------------------------------------------
    # Remove role-permission assignments created by this
    # migration.
    # -----------------------------------------------------

    permission_ids = [
        row.id
        for row in bind.execute(
            sa.select(
                permissions_table.c.id
            ).where(
                permissions_table.c.key.in_(
                    [
                        permission_key
                        for permission_key, _, _
                        in PERMISSIONS
                    ]
                )
            )
        ).all()
    ]

    if permission_ids:

        bind.execute(
            role_permissions_table.delete()
            .where(
                role_permissions_table.c.permission_id.in_(
                    permission_ids
                )
            )
        )

    # -----------------------------------------------------
    # Remove permissions created by this migration.
    # -----------------------------------------------------

    bind.execute(
        permissions_table.delete()
        .where(
            permissions_table.c.key.in_(
                [
                    permission_key
                    for permission_key, _, _
                    in PERMISSIONS
                ]
            )
        )
    )

    # -----------------------------------------------------
    # Restore old role names where possible.
    # -----------------------------------------------------

    reverse_role_mapping = {
        new_name: old_name
        for old_name, new_name
        in OLD_ROLE_MAPPING.items()
    }

    for new_name, old_name in reverse_role_mapping.items():

        bind.execute(
            roles_table.update()
            .where(
                roles_table.c.name ==
                new_name
            )
            .values(
                name=old_name
            )
        )

    # -----------------------------------------------------
    # Restore original development user role mapping.
    # -----------------------------------------------------

    old_user_roles = {
        "portadmin": "marine_officer",
        "vesseladmin": "marine_officer",
        "admin": "admin",
        "marine": "marine_officer",
        "manager": "port_operations_officer",
        "cargo": "cargo_officer",
        "gate": "gate_truck_officer",
        "maintenance": "maintenance_officer",
        "executive": "security_officer",
    }

    role_ids = {
        row.name: row.id
        for row in bind.execute(
            sa.select(
                roles_table.c.id,
                roles_table.c.name,
            )
        ).all()
    }

    for username, role_name in old_user_roles.items():

        role_id = role_ids.get(role_name)

        if role_id is not None:

            bind.execute(
                users_table.update()
                .where(
                    users_table.c.username ==
                    username
                )
                .values(
                    role_id=role_id
                )
            )