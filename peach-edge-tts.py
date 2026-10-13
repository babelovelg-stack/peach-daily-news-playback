"""Run the pinned edge-tts CLI against Microsoft's current synthesis endpoint.

Compatibility fix for edge-tts 7.2.8; no installed package files are modified.
Upstream proposal: https://github.com/rany2/edge-tts/pull/491
Recheck this adapter when upgrading edge-tts, then remove it once unnecessary.
"""

import sys

import edge_tts.communicate as communicate
from edge_tts.constants import TRUSTED_CLIENT_TOKEN
from edge_tts.util import main as edge_tts_main
from edge_tts.version import __version__


def main():
    if __version__ != "7.2.8":
        print(
            "Peach TTS adapter requires edge-tts==7.2.8; review the adapter before upgrading.",
            file=sys.stderr,
        )
        return 1

    # Only synthesis moved. Keep the library's signing, voice list and CLI intact.
    communicate.WSS_URL = (
        "wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1"
        f"?Ocp-Apim-Subscription-Key={TRUSTED_CLIENT_TOKEN}"
    )
    try:
        edge_tts_main()
    except Exception as error:
        # aiohttp exceptions can include the complete credential-bearing URL.
        status = getattr(error, "status", None)
        status_text = f", HTTP {status}" if isinstance(status, int) else ""
        print(
            f"Peach speech synthesis failed ({type(error).__name__}{status_text}); "
            "playback generation stopped. Check the speech service and pinned dependency.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
