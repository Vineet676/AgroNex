"""PostgreSQL connection helpers for AgroNex.

The database is opt-in: set DATABASE_URL before starting FastAPI.  Keeping the
connection lazy means the application can still run against its validated
snapshot while a developer is setting up PostgreSQL.
"""
from __future__ import annotations

import os
from pathlib import Path
from collections.abc import Generator

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


# Load the project-local .env without ever exposing its credentials in API
# responses or source control.  The file is ignored by Git.
load_dotenv(Path(__file__).resolve().parents[1] / ".env")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
engine = (
    create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
    if DATABASE_URL
    else None
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False) if engine else None


class Base(DeclarativeBase):
    """Base class for all AgroNex database tables."""


def database_configured() -> bool:
    return engine is not None and SessionLocal is not None


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for endpoints that require PostgreSQL."""
    if SessionLocal is None:
        raise RuntimeError("PostgreSQL is not configured. Set DATABASE_URL and restart the API.")
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
