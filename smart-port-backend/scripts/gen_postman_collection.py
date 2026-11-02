import ast
import json
import os
import sys

ROUTES_DIR = "app/api/routes"
OUT_PATH = "postman/Smart-Port-API.postman_collection.json"

def extract_router_info(path):
    """Return (prefix, tag, [(method, route_path, func_name), ...]) for one route file."""
    with open(path) as f:
        source = f.read()
    tree = ast.parse(source, filename=path)

    prefix = ""
    tag = os.path.basename(path).replace(".py", "").replace("_", " ").title()
    endpoints = []

    for node in ast.walk(tree):
        # Find: router = APIRouter(prefix="...", tags=[...])
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
            call = node.value
            func_name = getattr(call.func, "id", None) or getattr(call.func, "attr", None)
            if func_name == "APIRouter":
                for kw in call.keywords:
                    if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                        prefix = kw.value.value
                    if kw.arg == "tags" and isinstance(kw.value, ast.List):
                        if kw.value.elts and isinstance(kw.value.elts[0], ast.Constant):
                            tag = kw.value.elts[0].value

        # Find: @router.get("/path"), @router.post("/path"), etc.
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for dec in node.decorator_list:
                if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
                    if isinstance(dec.func.value, ast.Name) and dec.func.value.id == "router":
                        method = dec.func.attr.upper()
                        if method not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                            continue
                        route_path = ""
                        if dec.args and isinstance(dec.args[0], ast.Constant):
                            route_path = dec.args[0].value
                        endpoints.append((method, route_path, node.name))

    return prefix, tag, endpoints


def to_postman_path(full_path):
    """Convert FastAPI path (with {param}) into Postman's raw/path segments."""
    segments = [s for s in full_path.split("/") if s]
    return segments


def build_item(method, prefix, route_path, func_name):
    full_path = (prefix + route_path).rstrip("/") or "/"
    segments = to_postman_path(full_path)
    needs_body = method in ("POST", "PUT", "PATCH")
    item = {
        "name": f"{method} {full_path}",
        "request": {
            "method": method,
            "header": [
                {"key": "Authorization", "value": "Bearer {{access_token}}", "type": "text"}
            ],
            "url": {
                "raw": "{{base_url}}" + full_path,
                "host": ["{{base_url}}"],
                "path": segments,
            },
        },
        "response": [],
    }
    if needs_body:
        item["request"]["header"].append({"key": "Content-Type", "value": "application/json", "type": "text"})
        item["request"]["body"] = {
            "mode": "raw",
            "raw": "{}",
            "options": {"raw": {"language": "json"}},
        }
    return item


def main():
    folders = []
    total = 0
    for fname in sorted(os.listdir(ROUTES_DIR)):
        if not fname.endswith(".py") or fname.startswith("__"):
            continue
        path = os.path.join(ROUTES_DIR, fname)
        prefix, tag, endpoints = extract_router_info(path)
        if not endpoints:
            continue
        items = [build_item(m, prefix, p, fn) for (m, p, fn) in endpoints]
        folders.append({"name": tag, "item": items})
        total += len(items)

    # Add the two non-router endpoints defined directly in main.py: /health
    folders.insert(0, {
        "name": "Health",
        "item": [
            {
                "name": "GET /health",
                "request": {
                    "method": "GET",
                    "header": [],
                    "url": {"raw": "{{base_url}}/health", "host": ["{{base_url}}"], "path": ["health"]},
                },
                "response": [],
            }
        ],
    })
    total += 1

    collection = {
        "info": {
            "name": "Smart Sea Port Management System API",
            "description": "Auto-generated from FastAPI route definitions (smart-port-backend/app/api/routes/). "
                            "Set the {{base_url}} and {{access_token}} collection variables before running.",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": folders,
        "variable": [
            {"key": "base_url", "value": "https://smartport-singapore.duckdns.org/api", "type": "string"},
            {"key": "access_token", "value": "", "type": "string"},
        ],
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w") as f:
        json.dump(collection, f, indent=2)

    print(f"Wrote {OUT_PATH} with {len(folders)} folders, {total} requests")

if __name__ == "__main__":
    main()
