"""
Dev server launcher with auto port-fallback.

WinError 10013 ("An attempt was made to access a socket in a way forbidden
by its access permissions") on Windows is almost always an OS/environment
condition, not an application bug — most commonly a Hyper-V "excluded port
range" reservation silently blocking a port, or another process already
bound to it. There is no application-level fix for the underlying OS
condition; what IS fixable in code is giving the dev server somewhere else
to go instead of failing outright.

This script probes settings.PORT and the next 3 ports with a throwaway
socket bind (the same check the OS itself performs) and starts uvicorn on
the first one that's actually free, instead of hardcoding one port with no
fallback the way `uvicorn app.main:app --port 8000` does.

If ALL candidate ports fail, the printed error includes the two commands
most likely to explain why:
    netsh int ipv4 show excludedportrange protocol=tcp   (Hyper-V reservations)
    netstat -ano | findstr :8000                          (who's holding it)
"""
import socket
import sys
from pathlib import Path

import uvicorn

from app.config import settings

PORT_FALLBACK_ATTEMPTS = 4  # settings.PORT, PORT+1, PORT+2, PORT+3

# The frontend's Vite dev-server proxy (frontend/vite.config.js) reads this
# file to learn which port the backend actually landed on, since a fallback
# away from settings.PORT would otherwise leave the proxy pointed at a dead
# port. Dev-only convenience file — gitignored, never used in production
# (start.sh/Docker always bind the fixed port directly, no fallback).
PORT_FILE = Path(__file__).parent / ".dev-port"


def _port_is_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def find_available_port(host: str, start_port: int, attempts: int) -> int | None:
    for offset in range(attempts):
        candidate = start_port + offset
        if _port_is_free(host, candidate):
            return candidate
    return None


def main() -> None:
    host = settings.HOST
    port = find_available_port(host, settings.PORT, PORT_FALLBACK_ATTEMPTS)

    if port is None:
        tried = ", ".join(str(settings.PORT + i) for i in range(PORT_FALLBACK_ATTEMPTS))
        print(
            f"\nERROR: could not bind to any of ports {tried} on {host}.\n"
            "This is almost always a Windows/OS-level port restriction, not an app bug:\n"
            "  1) Check Hyper-V reserved port ranges:\n"
            "     netsh int ipv4 show excludedportrange protocol=tcp\n"
            "  2) Check what's already holding the port:\n"
            "     netstat -ano | findstr :" + str(settings.PORT) + "\n"
            "  3) Or set a different PORT in backend/.env and retry.\n",
            file=sys.stderr,
        )
        sys.exit(1)

    if port != settings.PORT:
        print(f"Port {settings.PORT} unavailable — falling back to {port}.")

    PORT_FILE.write_text(str(port))
    try:
        uvicorn.run("app.main:app", host=host, port=port, reload=True)
    finally:
        PORT_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
