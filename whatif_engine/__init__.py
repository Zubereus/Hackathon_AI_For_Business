"""What-If Decision & Simulation Engine package."""

from whatif_engine.baseline import build_baseline_demand
from whatif_engine.data_generator import generate_product_series, generate_retail_data
from whatif_engine.elasticity import (
    build_design_matrix,
    elasticity_coefficient,
    estimate_elasticity,
    fit_elasticity_ols,
    fit_poisson_irls,
)
from whatif_engine.schemas import (
    RetailDataset,
    RetailSalesRecord,
    ScenarioMetric,
    SimulationInput,
    SimulationOutput,
)

__all__ = [
    "RetailSalesRecord",
    "RetailDataset",
    "SimulationInput",
    "ScenarioMetric",
    "SimulationOutput",
    "generate_product_series",
    "generate_retail_data",
    "build_design_matrix",
    "fit_poisson_irls",
    "fit_elasticity_ols",
    "elasticity_coefficient",
    "estimate_elasticity",
    "build_baseline_demand",
]
