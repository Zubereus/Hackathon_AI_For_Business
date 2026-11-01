"""Helpers for Monte Carlo: draw assumptions, summarise results."""
import numpy as np


def draw_uniform(low: float, high: float, n_draws: int, seed: int) -> np.ndarray:
    """Draw n_draws values between low and high (an ASSUMPTION range)."""
    rng = np.random.default_rng(seed)
    return rng.uniform(low, high, n_draws)


def summarize(deltas: np.ndarray) -> dict:
    """Expected value, p10/p50/p90 and probability of loss for one scenario."""
    return {
        "expected": float(deltas.mean()),
        "p10": float(np.quantile(deltas, 0.10)),
        "p50": float(np.quantile(deltas, 0.50)),
        "p90": float(np.quantile(deltas, 0.90)),
        "p_loss": float((deltas < 0).mean()),
    }
