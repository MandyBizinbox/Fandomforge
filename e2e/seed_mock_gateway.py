#!/usr/bin/env python3
"""Enable the in-process mock checkout provider in the disposable E2E database only."""
from __future__ import annotations

import asyncio
import os

from motor.motor_asyncio import AsyncIOMotorClient


async def main() -> None:
    db_name = os.environ.get("DB_NAME", "")
    if os.environ.get("E2E_TEST_MODE") != "1" or not db_name.startswith("fandomforge_e2e_"):
        raise SystemExit("Refusing to seed mock gateway outside an isolated E2E database")
    if os.environ.get("ENVIRONMENT", "development").lower() == "production":
        raise SystemExit("Refusing to seed mock gateway in production")

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[db_name]
    try:
        gateway = {
            "key": "mock",
            "enabled": True,
            "display_name": "Mock Payment — E2E Only",
            "description": "Synthetic checkout provider for isolated browser acceptance.",
            "mode": "test",
            "sort_order": 1,
            "public_config": {},
            "settings": {},
            "secret_configured": False,
        }
        await db.settings.update_one(
            {"id": "platform"},
            {"$set": {"payment_gateways.mock": gateway}},
            upsert=True,
        )
        stored = await db.settings.find_one(
            {"id": "platform"}, {"_id": 0, "payment_gateways.mock": 1}
        )
        assert ((stored or {}).get("payment_gateways") or {}).get("mock") == gateway
        print("Enabled isolated mock checkout gateway")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
