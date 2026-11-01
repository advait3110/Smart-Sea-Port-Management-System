"""
Shared pytest setup for the backend test suite.

The app's settings (app/core/config.py) are REQUIRED fields read from a
.env file that is never committed to git (it holds real Supabase/JWT
secrets). So that tests can import the app's modules without that real
.env file - in CI, or on a fresh local checkout - we provide safe dummy
values here before anything else imports app.core.config.

These dummy values are never used to actually connect to a database:
SQLAlchemy's create_engine() does not open a connection until a query
is actually run, and these tests don't run real queries.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost:5432/testdb")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-ci-only-not-real")
