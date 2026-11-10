"""Natural Language Decision Parser for What-If AI.

Parses unstructured managerial queries (in Vietnamese or English) into
validated, deterministic DecisionActionSpec JSON contracts.

Strict Rules:
    - Zero arithmetic performed: Only parameter extraction and schema validation.
    - Deterministic fallback: Includes rule-based regex parsing for offline execution
      and robust validation error rejection.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Optional

from src.agents.schemas import DecisionActionSpec


class DecisionParser:
    """Parser translating natural language prompts into validated DecisionActionSpec objects."""

    def __init__(self, api_key: Optional[str] = None, model_name: str = "gemini-1.5-flash") -> None:
        """Initialize the decision parser.

        Args:
            api_key: Optional API key for LLM services (Gemini / OpenAI).
            model_name: Name of the LLM model to use if API key is present.
        """
        self.api_key = api_key
        self.model_name = model_name

    def parse_regex_fallback(self, query: str) -> DecisionActionSpec:
        """Extract decision parameters using deterministic pattern matching.

        Detects product IDs (e.g., P01, P12, SP01), percentage changes (+10%, -15%),
        reverse optimization targets (+20% lợi nhuận), and inventory limits.

        Args:
            query: User's natural language input string.

        Returns:
            DecisionActionSpec: Validated structured decision action specification.

        Raises:
            ValueError: If target product_id cannot be reliably identified.
        """
        # 1. Product ID detection: matches 'P01', 'P-01', 'SP01', 'SP_02', 'PRODUCT 1'
        prod_match = re.search(r"\b(P\d+|SP\d+|P-\d+|PRODUCT\s*\d+)\b", query, re.IGNORECASE)
        if not prod_match:
            # Fallback heuristic: check if query specifies single product tokens like 'P01'
            tokens = query.upper().split()
            potential_pids = [t for t in tokens if t.startswith("P") and any(c.isdigit() for c in t)]
            if potential_pids:
                product_id = potential_pids[0]
            else:
                raise ValueError(
                    "Không thể xác định mã sản phẩm (ví dụ: P01, P02) từ câu hỏi. "
                    "Vui lòng chỉ định rõ mã sản phẩm hoặc dùng Form nhập tay."
                )
        else:
            product_id = prod_match.group(1).replace(" ", "").upper()

        # 2. Check for reverse what-if intent ("tối ưu", "mục tiêu", "đạt", "tăng lợi nhuận")
        is_reverse = bool(
            re.search(r"(mục tiêu|đạt|tối ưu|tăng lợi nhuận|target|reverse)", query, re.IGNORECASE)
        )

        # 3. Detect percentages (e.g. "10%", "+15%", "-5%", "10.5 %")
        pct_matches = re.findall(r"([+-]?\s*\d+(?:\.\d+)?)\s*%", query)
        pct_value = 10.0  # Default assumption if percentage omitted
        if pct_matches:
            # Clean spaces like '+ 10' -> '+10'
            raw_pct = pct_matches[0].replace(" ", "")
            try:
                pct_value = float(raw_pct)
            except ValueError:
                pct_value = 10.0

        # Detect direction keywords if sign not explicit
        if "giảm" in query.lower() or "hạ" in query.lower() or "drop" in query.lower():
            pct_value = -abs(pct_value)
        elif "tăng" in query.lower() or "nâng" in query.lower() or "increase" in query.lower():
            pct_value = abs(pct_value)

        # 4. Detect stock constraints (e.g. "tồn kho 500", "stock 1000", "chỉ còn 1200")
        stock_match = re.search(r"(?:tồn kho|kho|stock|còn)\s*(?:là|khoảng)?\s*(\d+)", query, re.IGNORECASE)
        stock_limit = float(stock_match.group(1)) if stock_match else None

        # 5. Build DecisionActionSpec
        if is_reverse:
            return DecisionActionSpec(
                product_id=product_id,
                action_type="reverse_target",
                price_change_pct=0.0,
                reverse_target_pct=pct_value,
                stock_limit=stock_limit,
            )

        return DecisionActionSpec(
            product_id=product_id,
            action_type="price_change",
            price_change_pct=pct_value,
            reverse_target_pct=None,
            stock_limit=stock_limit,
        )

    def parse(self, query: str) -> DecisionActionSpec:
        """Parse natural language query into validated DecisionActionSpec.

        Tries LLM parsing if configured; seamlessly falls back to regex parser
        upon any network, API, or validation error.

        Args:
            query: User's input question or command.

        Returns:
            DecisionActionSpec: Validated decision specification.
        """
        # If no LLM credentials provided, use deterministic rule-based parsing
        if not self.api_key:
            return self.parse_regex_fallback(query)

        # When API key is provided, LLM parsing with JSON schema enforcement can be invoked.
        # Strict fallback guarantees high availability under all network environments.
        try:
            return self._call_llm_parser(query)
        except Exception:
            return self.parse_regex_fallback(query)

    def _call_llm_parser(self, query: str) -> DecisionActionSpec:
        """Helper to invoke LLM with strict JSON schema instructions.

        Args:
            query: Input user query.

        Returns:
            DecisionActionSpec: Parsed and validated model.
        """
        # Placeholder for external LLM call; falls back to regex in offline/sandbox environment
        return self.parse_regex_fallback(query)
