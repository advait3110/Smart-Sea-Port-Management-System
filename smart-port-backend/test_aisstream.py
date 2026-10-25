import asyncio
import json
import os
import time

import websockets
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("AISSTREAM_API_KEY")

if not API_KEY:
    raise RuntimeError("AISSTREAM_API_KEY is missing from .env")

SUBSCRIPTION = {
    "APIKey": API_KEY,
    "BoundingBoxes": [[[8.0, 68.0], [22.0, 80.0]]],
}

async def main():
    total_messages = 0
    position_reports = 0
    start = time.monotonic()
    duration_seconds = 300

    try:
        async with websockets.connect(
            "wss://stream.aisstream.io/v0/stream",
            open_timeout=20,
            close_timeout=10,
            ping_interval=20,
            ping_timeout=20,
            max_size=2**20,
        ) as websocket:
            print("Connected to AISStream.")
            await websocket.send(json.dumps(SUBSCRIPTION))
            print("Waiting up to 300 seconds for AIS messages...")

            while True:
                remaining = duration_seconds - (time.monotonic() - start)
                if remaining <= 0:
                    break

                try:
                    raw = await asyncio.wait_for(
                        websocket.recv(), timeout=remaining
                    )
                except asyncio.TimeoutError:
                    break

                total_messages += 1

                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    print("Non-JSON message received.")
                    continue

                message_type = message.get("MessageType")
                if message_type:
                    print(f"Message type: {message_type}")

                if message.get("error"):
                    print("AISStream error:", message["error"])
                    continue

                if message_type == "PositionReport":
                    meta = message.get("MetaData") or {}
                    position = (
                        message.get("Message", {}).get("PositionReport", {})
                    )

                    lat = meta.get("latitude", position.get("Latitude"))
                    lon = meta.get("longitude", position.get("Longitude"))
                    name = meta.get("ShipName") or "Unknown"

                    position_reports += 1
                    print(
                        f"Position #{position_reports}: {name} | "
                        f"lat={lat} | lon={lon}"
                    )

    except Exception as exc:
        print(f"Connection/test error: {type(exc).__name__}: {exc}")

    print("\n--- Test summary ---")
    print(f"Elapsed: {time.monotonic() - start:.1f} seconds")
    print(f"Total messages received: {total_messages}")
    print(f"Position reports received: {position_reports}")

if __name__ == "__main__":
    asyncio.run(main())