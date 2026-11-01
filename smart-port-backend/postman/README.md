# Smart Sea Port API - Postman Collection

Auto-generated from the FastAPI route definitions in `app/api/routes/`
(117 requests across 20 folders, matching the live OpenAPI spec at
`/api/openapi.json`).

## Setup

1. Import `Smart-Port-API.postman_collection.json` into Postman.
2. In the collection's **Variables** tab, fill in:
   - `admin_username` - the Port Administrator's Admin ID
   - `admin_password` - their password
   - `base_url` is already set to the live deployment
     (`https://smartport-singapore.duckdns.org/api`); change it if
     testing a different environment (e.g. `http://localhost:8000`).
3. Run **Authentication -> POST /auth/login** once. Its test script
   automatically saves the returned JWT into the `access_token`
   collection variable, so every other request in the collection is
   authenticated from then on without any manual copy-pasting.

## Regenerating

If routes change, regenerate the collection from the backend root:

```bash
python3 scripts/gen_postman_collection.py
```

(parses the route files directly with Python's `ast` module - no
server needs to be running, no extra dependencies.)
