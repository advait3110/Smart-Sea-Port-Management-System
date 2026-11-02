import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


# ============================================================
# DATABASE ENGINE
# ============================================================
#
# Supabase (session pooler, port 5432) allows only 15 database
# connections IN TOTAL for this project. Two backends use the same
# database: the one on this laptop and the live site on AWS EC2.
#
# Without a limit, SQLAlchemy lets one backend open up to 15
# connections (5 kept + 10 extra), so a single backend could use up
# the whole allowance and the other one got:
#   "(EMAXCONNSESSION) max clients reached in session mode"
#
# Each backend now keeps at most 4 connections and borrows at most
# 2 extra when it is busy: 6 per backend, 12 for both, which leaves
# room for the Supabase dashboard.
#
# When all 6 are busy, a request WAITS (up to 30 seconds) for a free
# connection instead of failing.
#
# The numbers can be changed without editing code, in .env:
#   DB_POOL_SIZE=4
#   DB_MAX_OVERFLOW=2
# ============================================================

POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "4"))

MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "2"))

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_timeout=30,
    pool_pre_ping=True,
    # Give idle connections back to Supabase after 5 minutes.
    pool_recycle=300,
    connect_args={
        "connect_timeout": 5,
    },
)


# ============================================================
# DATABASE SESSION
# ============================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)