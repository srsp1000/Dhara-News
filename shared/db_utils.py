"""Shared async PostgreSQL helper utilities used across API, agents, and scripts."""

from __future__ import annotations

import asyncpg


async def create_pg_pool(
    dsn: str,
    min_size: int = 1,
    max_size: int = 10,
    init: callable | None = None,
) -> asyncpg.Pool:
    if init is None:
        return await asyncpg.create_pool(dsn, min_size=min_size, max_size=max_size)
    return await asyncpg.create_pool(dsn, min_size=min_size, max_size=max_size, init=init)


def ensure_pool(pool: asyncpg.Pool | None) -> asyncpg.Pool:
    if pool is None:
        raise RuntimeError("Database pool is not initialized")
    return pool


async def db_fetch(pool: asyncpg.Pool | None, query: str, *args):
    active_pool = ensure_pool(pool)
    async with active_pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def db_fetchrow(pool: asyncpg.Pool | None, query: str, *args):
    active_pool = ensure_pool(pool)
    async with active_pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def db_execute(pool: asyncpg.Pool | None, query: str, *args):
    active_pool = ensure_pool(pool)
    async with active_pool.acquire() as conn:
        return await conn.execute(query, *args)
