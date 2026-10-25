"""
RBAC AUDIT (read-only)

Lists every API endpoint found in app/api (all sub-folders)
and app/main.py and says who can call it. Nothing is changed
and the server does not need to be running: the files are
only READ.

Run from the smart-port-backend folder:

    python app/scripts/audit_rbac.py

It follows app.include_router(...) lines, so a rule added in
main.py for a whole router is counted. A file whose router is
never included is listed separately as NOT USED.

How to read the result:

    PUBLIC              no login needed
    LOGGED-IN ONLY      any employee with a valid login can call it
    MODULE: cargo       only roles that have the "cargo" feature
                        (reading also: other features that may read)
    ADMIN ONLY          only the Port Administrator role
    ROLES: A, B         only the named roles
    CUSTOM: name        a custom check; read that function by hand

The NEEDS ATTENTION list at the end shows endpoints that are
PUBLIC or LOGGED-IN ONLY and are not on the short list of
endpoints that are meant to be like that.
"""

import ast
import re
import sys
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
API_DIR = APP_DIR / "api"
MAIN_FILE = APP_DIR / "main.py"

HTTP_METHODS = {"get", "post", "put", "patch", "delete"}

# Endpoints that are meant to be PUBLIC or LOGGED-IN ONLY.
EXPECTED_OPEN = {
    ("POST", "/auth/login"),
    ("GET", "/auth/me"),
    ("PUT", "/users/me/credentials"),
    ("GET", "/health"),
    ("POST", "/presence/heartbeat"),
    ("POST", "/presence/logout"),
    ("GET", "/presence/me"),
}

IGNORED_DEPENDENCIES = {"get_db"}

# Helpers that protect a whole router with one feature.
MODULE_ACCESS_HELPERS = {"require_module_access", "module_guard"}


def literal(node):
    if isinstance(node, ast.Constant):
        return node.value
    return None


def name_or_literal(node):
    """A text value, or the name of the variable that holds it."""

    value = literal(node)

    if value is not None:
        return str(value)

    if isinstance(node, ast.Name):
        return node.id

    return None


def strings_in(node):
    """All text values in a tuple / list / single value."""

    if isinstance(node, (ast.Tuple, ast.List)):
        items = [name_or_literal(item) for item in node.elts]
    else:
        items = [name_or_literal(node)]

    return [item for item in items if item]


def module_access_label(call):
    """
    require_module_access("vessels", also_read=("dashboard",))
    module_guard("vessels", "dashboard", "port_map")
    """

    if not call.args:
        return ("module", "MODULE: (unreadable)")

    module_key = name_or_literal(call.args[0]) or "?"

    func_name = call.func.id

    if func_name == "module_guard":
        related = [
            text
            for arg in call.args[1:]
            for text in strings_in(arg)
        ]
    else:
        related = []

        for keyword in call.keywords:
            if keyword.arg == "also_read":
                related = strings_in(keyword.value)

    text = f"MODULE: {module_key}"

    if related:
        text += " (reading also: " + ", ".join(related) + ")"

    return ("module", text)


def describe_dependency(call):
    """
    call is the argument of Depends(...), or a helper call.
    Returns (kind, text) or None when it can be ignored.
    """

    if isinstance(call, ast.Name):
        name = call.id

        if name in IGNORED_DEPENDENCIES:
            return None

        if name == "get_current_user":
            return ("login", "LOGGED-IN ONLY")

        if "port_admin" in name.lower() or name.lower() in {
            "require_admin",
            "admin_only",
        }:
            return ("admin", "ADMIN ONLY")

        return ("custom", f"CUSTOM: {name}")

    if isinstance(call, ast.Call) and isinstance(
        call.func, ast.Name
    ):
        name = call.func.id

        if name in MODULE_ACCESS_HELPERS:
            return module_access_label(call)

        if name == "require_module_permission":
            keys = [
                text
                for arg in call.args
                for text in strings_in(arg)
            ]

            return (
                "module",
                "MODULE: " + ", ".join(keys),
            )

        if name == "require_roles":
            roles = [
                text
                for arg in call.args
                for text in strings_in(arg)
            ]

            return (
                "roles",
                "ROLES: " + ", ".join(roles),
            )

        return ("custom", f"CUSTOM: {name}(...)")

    if isinstance(call, ast.Attribute):
        return ("custom", f"CUSTOM: {call.attr}")

    return ("custom", "CUSTOM: (unreadable)")


def labels_from(node):
    """
    Rules found in a dependencies=[...] value: either
    Depends(...) items or a helper such as module_guard(...).
    """

    labels = []

    if (
        isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id in MODULE_ACCESS_HELPERS
    ):
        labels.append(module_access_label(node))
        return labels

    for child in ast.walk(node):
        if (
            isinstance(child, ast.Call)
            and isinstance(child.func, ast.Name)
            and child.func.id == "Depends"
            and child.args
        ):
            described = describe_dependency(child.args[0])

            if described:
                labels.append(described)

    return labels


def is_apirouter_call(node):
    if not isinstance(node, ast.Call):
        return False

    func = node.func

    return (
        isinstance(func, ast.Name) and func.id == "APIRouter"
    ) or (
        isinstance(func, ast.Attribute)
        and func.attr == "APIRouter"
    )


def router_settings(tree):
    """
    prefix and router-level rules of router = APIRouter(...)
    """

    prefix = ""
    labels = []

    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Assign)
            and is_apirouter_call(node.value)
        ):
            continue

        for keyword in node.value.keywords:
            if keyword.arg == "prefix":
                prefix = literal(keyword.value) or ""

            if keyword.arg == "dependencies":
                labels += labels_from(keyword.value)

    return prefix, labels


def file_of_module(dotted):
    """app.api.routes.berths -> .../app/api/routes/berths.py"""

    path = APP_DIR.parent / (dotted.replace(".", "/") + ".py")

    return path if path.exists() else None


def includes_in(path, tree):
    """
    Every  something.include_router(router, ...)  in a file.
    Returns {file that defines the router: [(prefix, labels)]}
    """

    # name used in this file -> dotted module it came from
    modules = {}

    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module:
            for alias in node.names:
                local = alias.asname or alias.name

                if alias.name == "router":
                    modules[local] = node.module
                else:
                    modules[local] = node.module + "." + alias.name

        if isinstance(node, ast.Import):
            for alias in node.names:
                modules[alias.asname or alias.name] = alias.name

    found = {}

    for node in ast.walk(tree):
        if not (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "include_router"
            and node.args
        ):
            continue

        target = node.args[0]

        if isinstance(target, ast.Name):
            dotted = modules.get(target.id)
        elif (
            isinstance(target, ast.Attribute)
            and isinstance(target.value, ast.Name)
        ):
            dotted = modules.get(target.value.id)
        else:
            dotted = None

        if dotted is None:
            continue

        router_file = file_of_module(dotted)

        if router_file is None:
            continue

        prefix = ""
        labels = []

        for keyword in node.keywords:
            if keyword.arg == "prefix":
                prefix = literal(keyword.value) or ""

            if keyword.arg == "dependencies":
                labels += labels_from(keyword.value)

        found.setdefault(router_file.resolve(), []).append(
            (prefix, labels)
        )

    return found


def endpoints_in(path, tree, mounts):
    """
    mounts: [(prefix, labels)] where the router is included,
    or None for main.py (its endpoints are on the app itself).
    """

    router_prefix, router_labels = router_settings(tree)

    rows = []

    for node in ast.walk(tree):
        if not isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            continue

        for decorator in node.decorator_list:
            if not (
                isinstance(decorator, ast.Call)
                and isinstance(decorator.func, ast.Attribute)
                and decorator.func.attr in HTTP_METHODS
            ):
                continue

            route_path = ""

            if decorator.args:
                route_path = literal(decorator.args[0]) or ""

            own_labels = list(router_labels)

            # dependencies=[...] on the decorator
            for keyword in decorator.keywords:
                if keyword.arg == "path":
                    route_path = literal(keyword.value) or ""

                if keyword.arg == "dependencies":
                    own_labels += labels_from(keyword.value)

            # parameters such as: _: User = Depends(...)
            defaults = list(node.args.defaults) + [
                d for d in node.args.kw_defaults if d is not None
            ]

            for default in defaults:
                own_labels += labels_from(default)

            for include_prefix, include_labels in (
                mounts or [("", [])]
            ):
                rows.append(
                    {
                        "file": str(path.relative_to(APP_DIR)),
                        "method": decorator.func.attr.upper(),
                        "path": (
                            include_prefix
                            + router_prefix
                            + route_path
                        )
                        or "/",
                        "labels": own_labels + include_labels,
                    }
                )

    return rows


def summarise(labels):
    """
    Strongest rule wins. Returns (text, level)
    level: ok, login, public, custom
    """

    kinds = {kind for kind, _ in labels}

    texts = []

    for kind in ("module", "admin", "roles", "custom"):
        texts += [text for k, text in labels if k == kind]

    if kinds & {"module", "admin", "roles"}:
        return " + ".join(dict.fromkeys(texts)), "ok"

    if "custom" in kinds:
        return " + ".join(dict.fromkeys(texts)), "custom"

    if "login" in kinds:
        return "LOGGED-IN ONLY", "login"

    return "PUBLIC", "public"


def sort_key(row):
    return (row["path"], row["method"])


def main():
    if not API_DIR.exists():
        print(f"Cannot find {API_DIR}")
        print("Run this file from the smart-port-backend folder.")
        sys.exit(1)

    files = sorted(
        path
        for path in API_DIR.rglob("*.py")
        if path.name not in {"__init__.py", "dependencies.py"}
    )

    if MAIN_FILE.exists():
        files.append(MAIN_FILE)

    trees = {}

    for path in files:
        try:
            trees[path] = ast.parse(
                path.read_text(encoding="utf-8")
            )
        except SyntaxError as error:
            print(f"Cannot read {path.name}: {error}")

    # Which router files are really included, and with what rules.
    mounted = {}

    for path, tree in trees.items():
        for router_file, items in includes_in(path, tree).items():
            mounted.setdefault(router_file, []).extend(items)

    live_rows = []
    unused_rows = []

    for path, tree in trees.items():
        if path == MAIN_FILE:
            live_rows += endpoints_in(path, tree, None)
            continue

        mounts = mounted.get(path.resolve())

        if mounts:
            live_rows += endpoints_in(path, tree, mounts)
        else:
            unused_rows += endpoints_in(path, tree, None)

    live_rows.sort(key=sort_key)

    print()
    print(f"{'METHOD':<7} {'PATH':<34} {'FILE':<24} WHO CAN CALL")
    print("-" * 110)

    attention = []

    for row in live_rows:
        text, level = summarise(row["labels"])

        # Related features only matter for reading (GET).
        if row["method"] != "GET":
            text = re.sub(r" \(reading also: [^)]*\)", "", text)

        expected = (row["method"], row["path"]) in EXPECTED_OPEN

        mark = ""

        if level in {"public", "login"} and not expected:
            mark = "   <-- CHECK"
            attention.append((row, text))

        if level == "custom":
            mark = "   <-- read by hand"

        print(
            f"{row['method']:<7} {row['path']:<34} "
            f"{row['file']:<24} {text}{mark}"
        )

    print("-" * 110)
    print(f"{len(live_rows)} live endpoints.")
    print()

    if attention:
        print("NEEDS ATTENTION (no module / admin / role rule):")

        for row, text in attention:
            print(
                f"  {row['method']:<7} {row['path']:<34} "
                f"{row['file']:<24} {text}"
            )
    else:
        print("Nothing needs attention.")

    if unused_rows:
        files_unused = sorted({row["file"] for row in unused_rows})

        print()
        print(
            "NOT USED (the router is never included, so these "
            "endpoints do not exist):"
        )

        for name in files_unused:
            count = sum(1 for row in unused_rows if row["file"] == name)
            print(f"  {name} ({count} endpoints)")

    print()
    print(
        "Note: paths are shown as written in the route files "
        "and include_router lines. A prefix added any other way "
        "(for example /api) is not shown."
    )


if __name__ == "__main__":
    main()