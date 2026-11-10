"""Synonym dictionary per canonical schema field for NLP column mapping.

Supports:
    - Vietnamese terms (with and without diacritics)
    - Standard English commercial column headers
    - Common ERP / SAP abbreviations (e.g. SKU_CD, UNIT_PRC, QTY, TXN_DT, OH_QTY)

Strict Rules:
    - 100% Type Hints and Google-style docstrings.
"""

from __future__ import annotations

import unicodedata
from typing import Dict, List, Set


def strip_accents(text: str) -> str:
    """Normalize string and remove Vietnamese diacritics/accents.

    Args:
        text: Input text.

    Returns:
        str: Lowercase ascii-friendly string without accents.
    """
    text_lower = text.lower().strip()
    text_nfkd = unicodedata.normalize("NFKD", text_lower)
    return "".join(c for c in text_nfkd if not unicodedata.combining(c)).replace("đ", "d").replace("Đ", "d")


# Canonical field vocabulary mappings
CANONICAL_DICTIONARY: Dict[str, List[str]] = {
    "date": [
        "date", "ngay", "ngay ban", "ngay dat hang", "ngay giao dich", "thoi gian",
        "ngay hoa don", "ngay thang", "order date", "sales date", "transaction date",
        "txn date", "timestamp", "time", "day", "txn dt", "sale dt", "ord dt",
        "dt", "invoice date", "order dt",
    ],
    "product_id": [
        "product id", "ma san pham", "ma sp", "ma hang", "ma mat hang", "sku",
        "sku id", "item id", "item code", "product code", "prod id", "material id",
        "sku cd", "item cd", "prod cd", "part no", "barcode", "upc", "ean",
    ],
    "product_name": [
        "product name", "ten san pham", "ten sp", "ten hang", "ten mat hang",
        "item name", "item description", "product description", "description",
        "item desc", "prod name", "sku desc", "item", "san pham", "ten", "title",
    ],
    "category": [
        "category", "nganh hang", "nhom hang", "danh muc", "loai san pham",
        "chung loai", "phan loai", "dept", "department", "group", "product group",
        "cat l1", "cat l2", "family", "class", "matkl", "merchandise group",
    ],
    "price": [
        "price", "gia ban", "don gia", "gia", "gia ban vnd", "don gia ban",
        "gia niem yet", "don gia nghin dong", "sell price", "selling price",
        "unit price", "sale price", "retail price", "list price", "unit prc",
        "sel prc", "sls prc", "gia le", "price vnd",
    ],
    "unit_cost": [
        "unit cost", "gia von", "chi phi", "gia nhap", "gia mua", "cost",
        "gia von hang ban", "cogs", "purchase price", "cost price", "buy price",
        "wholesale price", "unit cst", "cst prc", "pur prc", "chi phi/dv",
        "chi phi don vi",
    ],
    "quantity": [
        "quantity", "so luong", "sl", "sl ban", "so luong ban", "san luong",
        "luong ban", "units", "units sold", "volume", "sales volume",
        "quantity sold", "qty", "sls qty", "ord qty", "count", "so luong mua",
    ],
    "stock": [
        "stock", "ton kho", "so luong ton", "hang ton", "luong ton",
        "ton cuoi ngay", "ton kha dung", "inventory", "on hand", "stock on hand",
        "available stock", "stock qty", "oh qty", "inv qty", "soh",
    ],
    "promo": [
        "promo", "khuyen mai", "km", "giam gia", "chuong trinh khuyen mai",
        "uu dai", "promotion", "discount", "discount flag", "is promo",
        "promo flag", "promotion flag", "promo flg", "disc flg",
    ],
}


def get_normalized_dictionary() -> Dict[str, Set[str]]:
    """Return dictionary of canonical fields with stripped-accent, lowercase synonyms."""
    norm_dict: Dict[str, Set[str]] = {}
    for canonical, terms in CANONICAL_DICTIONARY.items():
        synonyms: Set[str] = set()
        for t in terms:
            cleaned = t.lower().strip()
            synonyms.add(cleaned)
            synonyms.add(strip_accents(cleaned))
            # Also add compact version without spaces/underscores
            synonyms.add(cleaned.replace(" ", "").replace("_", ""))
            synonyms.add(strip_accents(cleaned).replace(" ", "").replace("_", ""))
        norm_dict[canonical] = synonyms
    return norm_dict

