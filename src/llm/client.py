"""Client for the local Ollama chat API."""

import os

import requests


def complete(system: str, user: str, model: str | None = None) -> str:
    """Request a completion from the local Ollama server."""
    selected_model = model or os.getenv("DECISIONDESK_MODEL") or "qwen2.5:3b"
    payload = {
        "model": selected_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "options": {"temperature": 0.2},
    }
    try:
        response = requests.post(
            "http://localhost:11434/api/chat",
            json=payload,
            timeout=120,
        )
    except (requests.ConnectionError, requests.Timeout) as error:
        raise RuntimeError(
            "Could not reach Ollama. Is Ollama running? Try: ollama serve"
        ) from error

    response.raise_for_status()
    return response.json()["message"]["content"]
