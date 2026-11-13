"""Provider-agnostic LLM client wrapper for What-If AI.

Supports OpenAI-compatible and Google Gemini REST endpoints via environment variables:
    - LLM_PROVIDER: 'openai' | 'gemini' | 'none' (default: 'none' if no key)
    - LLM_API_KEY: API key string (optional; falls back cleanly to rule-based logic if absent)
    - LLM_MODEL: Model identifier (e.g. 'gpt-4o-mini', 'gemini-2.0-flash')
    - LLM_BASE_URL: Custom base URL for OpenAI-compatible gateways

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
    - Temperature = 0.0 for deterministic structured output.
    - Timeout = 10 seconds with 1 automatic retry.
    - Privacy: Never log prompts, sample rows, or business data.
"""

from __future__ import annotations

import json
import logging
import os
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger("whatif.llm")

DEFAULT_TIMEOUT_SEC: float = 10.0
MAX_RETRIES: int = 1


def _load_dotenv_if_present() -> None:
    """Populate unset env vars from local .env outside pytest runs."""
    if os.environ.get("PYTEST_CURRENT_TEST"):
        return
    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.abspath(os.path.join(here, "..", "..", ".env")),
        os.path.abspath(os.path.join(here, "..", "..", "..", ".env")),
    ]
    for path in candidates:
        if not os.path.isfile(path):
            continue
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for raw_line in fh:
                    line = raw_line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, val = line.split("=", 1)
                    key = key.strip()
                    if key.startswith("export "):
                        key = key[7:].strip()
                    val = val.strip().strip('"').strip("'")
                    if key and key not in os.environ and val:
                        os.environ[key] = val
        except OSError:
            continue
        break


def _resolve_api_key_and_hint() -> tuple[str, str]:
    """Return first configured API key and provider hint without logging values."""
    for env_name, hint in (
        ("LLM_API_KEY", ""),
        ("AI_API_KEY", ""),
        ("GEMINI_API_KEY", "gemini"),
        ("OPENAI_API_KEY", "openai"),
    ):
        val = os.environ.get(env_name, "").strip()
        if val:
            return val, hint
    return "", ""


class LLMClient:
    """Provider-agnostic HTTP client for structured LLM inference."""

    def __init__(
        self,
        provider: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SEC,
    ) -> None:
        _load_dotenv_if_present()
        env_key, hint_provider = _resolve_api_key_and_hint()
        self.api_key = api_key.strip() if api_key is not None else env_key

        raw_provider = provider if provider is not None else os.environ.get("LLM_PROVIDER", "")
        clean_provider = raw_provider.strip().lower()
        if clean_provider:
            self.provider = clean_provider
        elif not self.api_key:
            self.provider = "none"
        elif hint_provider:
            self.provider = hint_provider
        elif self.api_key.startswith("AIza"):
            self.provider = "gemini"
        else:
            self.provider = "openai"

        self.model = model or os.environ.get(
            "LLM_MODEL",
            "gemini-2.0-flash" if self.provider == "gemini" else "gpt-4o-mini",
        )
        self.base_url = base_url or os.environ.get("LLM_BASE_URL", "").strip()
        self.timeout = timeout

    def is_configured(self) -> bool:
        """Return True if an active LLM provider and API key are configured."""
        return bool(self.api_key) and self.provider not in ("", "none", "disabled", "offline")

    def complete_json(
        self,
        system_prompt: str,
        user_prompt: str,
        json_schema: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Request JSON-constrained completion with temperature=0, timeout=10s, 1 retry.

        Args:
            system_prompt: System instructions.
            user_prompt: Input prompt.
            json_schema: Optional JSON schema object to guide structured output.

        Returns:
            Optional[Dict[str, Any]]: Parsed JSON dictionary, or None on unconfigured/error state.
        """
        text = self._complete_raw(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            expect_json=True,
            json_schema=json_schema,
        )
        if text is None:
            return None

        cleaned = text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        try:
            data = json.loads(cleaned)
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            logger.warning("LLM output was not valid JSON.")
            return None

    def complete_text(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> Optional[str]:
        """Request plain-text completion with temperature=0, timeout=10s, 1 retry."""
        return self._complete_raw(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            expect_json=False,
            json_schema=None,
        )

    def _complete_raw(
        self,
        system_prompt: str,
        user_prompt: str,
        expect_json: bool,
        json_schema: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        """Execute HTTP POST against configured LLM endpoint with retry."""
        if not self.is_configured():
            return None

        attempts = 1 + MAX_RETRIES
        for attempt in range(attempts):
            try:
                if self.provider == "gemini":
                    return self._call_gemini(system_prompt, user_prompt, expect_json)
                return self._call_openai(system_prompt, user_prompt, expect_json, json_schema)
            except (urllib.error.URLError, TimeoutError, Exception) as err:
                logger.warning("LLM call failed on attempt %d/%d (%s).", attempt + 1, attempts, type(err).__name__)
                if attempt + 1 < attempts:
                    time.sleep(0.5)
        return None

    def _call_openai(
        self,
        system_prompt: str,
        user_prompt: str,
        expect_json: bool,
        json_schema: Optional[Dict[str, Any]],
    ) -> Optional[str]:
        url = (
            f"{self.base_url.rstrip('/')}/chat/completions"
            if self.base_url
            else "https://api.openai.com/v1/chat/completions"
        )
        payload: Dict[str, Any] = {
            "model": self.model,
            "temperature": 0.0,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        if expect_json:
            payload["response_format"] = {"type": "json_object"}
            if json_schema:
                payload["messages"][0]["content"] += f"\nSchema: {json.dumps(json_schema)}"

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        choices = body.get("choices", [])
        if choices:
            return str(choices[0].get("message", {}).get("content", ""))
        return None

    def _call_gemini(
        self,
        system_prompt: str,
        user_prompt: str,
        expect_json: bool,
    ) -> Optional[str]:
        base = self.base_url.rstrip("/") if self.base_url else "https://generativelanguage.googleapis.com/v1beta"
        url = f"{base}/models/{self.model}:generateContent?key={self.api_key}"
        gen_config: Dict[str, Any] = {"temperature": 0.0}
        if expect_json:
            gen_config["responseMimeType"] = "application/json"

        payload: Dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": gen_config,
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        candidates = body.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return str(parts[0].get("text", ""))
        return None

