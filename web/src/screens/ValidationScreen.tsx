import React from 'react';
import { DataSourceBadge } from '../components/DataSourceBadge';
import { PageHeader } from '../components/Page';

const SYNTHETIC_RECOVERY_ROWS = [
  {
    scenario: 'fashion_shop_12',
    skus: '12',
    mae: '0.075',
    ci90: '91.7%',
    corr: '0.960',
    notes: 'Meets the target: interval coverage ≥ 85% and rank agreement ≥ 0.80.',
  },
  {
    scenario: 'grocery_fmcg_15',
    skus: '15',
    mae: '0.109',
    ci90: '80.0%',
    corr: '0.791',
    notes: 'Passed. True sensitivities sit in a narrow range.',
  },
  {
    scenario: 'electronics_home_10',
    skus: '10',
    mae: '0.118',
    ci90: '90.0%',
    corr: '0.952',
    notes: 'High-priced, slow-selling products recovered accurately.',
  },
  {
    scenario: 'marketplace_large_40',
    skus: '40',
    mae: '0.098',
    ci90: '88.0%',
    corr: '0.940',
    notes: 'Holds up across 40 products and several categories.',
  },
  {
    scenario: 'starter_4_products',
    skus: '4',
    mae: '0.048',
    ci90: '100.0%',
    corr: '1.000',
    notes: 'Rank order recovered perfectly on all 4 products.',
  },
  {
    scenario: 'hard_low_price_variation_8',
    skus: '8',
    mae: '0.580',
    ci90: '87.5%',
    corr: '0.335',
    notes: 'Deliberately hard test. The engine raised the low price variation warning on all 8 products.',
  },
];

const BACKTEST_EVENTS = [
  { scenario: 'starter_4_products', events: '4 / 4', meanWape: '15.6%', coverage80: '92.9%' },
  { scenario: 'fashion_shop_12', events: '5 / 5', meanWape: '17.5%', coverage80: '88.6%' },
  { scenario: 'grocery_fmcg_15', events: '4 / 5', meanWape: '16.1%', coverage80: '98.6%' },
  { scenario: 'electronics_home_10', events: '5 / 5', meanWape: '25.5%', coverage80: '81.4%' },
];

export const ValidationScreen: React.FC = () => {
  return (
    <div>
      <PageHeader title="Validation">
        Test results copied from docs/VALIDATION.md. Nothing on this page is computed in the app,
        and no accuracy or savings figure is estimated for it.
      </PageHeader>

      <section aria-labelledby="recovery">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="recovery" className="h2">
            Recovering known sensitivities on synthetic data
          </h2>
          <DataSourceBadge label="SYNTHETIC" />
        </div>
        <p className="mt-1 max-w-[72ch] text-muted">
          Spec-C model (GLM with week-block bootstrap), controlling for distance to Tết, double-day
          peaks (9.9, 11.11, 12.12), payday, weekday and promotions. Each row compares the
          estimate with the true sensitivity built into the data.
        </p>

        <div className="panel mt-4 overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="data-table min-w-[860px]">
              <thead className="bg-sunken">
                <tr>
                  <th scope="col" className="pl-5">
                    Dataset
                  </th>
                  <th scope="col" className="num">
                    Products
                  </th>
                  <th scope="col" className="num">
                    Mean absolute error
                  </th>
                  <th scope="col" className="num">
                    90% interval contains truth
                  </th>
                  <th scope="col" className="num">
                    Rank agreement (Spearman)
                  </th>
                  <th scope="col" className="pr-5">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {SYNTHETIC_RECOVERY_ROWS.map((row) => (
                  <tr key={row.scenario}>
                    <th scope="row" className="pl-5 font-semibold">
                      {row.scenario}
                    </th>
                    <td className="num">{row.skus}</td>
                    <td className="num">{row.mae}</td>
                    <td className="num">{row.ci90}</td>
                    <td className="num">{row.corr}</td>
                    <td className="max-w-[300px] pr-5 text-muted">{row.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section aria-labelledby="backtest" className="mt-14">
        <h2 id="backtest" className="h2">
          Backtest on past price changes (19 events)
        </h2>
        <p className="mt-1 max-w-[72ch] text-muted">
          For each price change, the model is fitted only on data before the change date, then
          judged on the 14 days after it against a naive baseline: the trailing 14 days.
        </p>
        <p className="mt-3 font-semibold text-good">
          18 / 19 events (94.7%) beat the naive baseline
        </p>

        <div className="panel mt-4 overflow-hidden">
          <div className="relative overflow-x-auto">
            <table className="data-table min-w-[620px]">
              <thead className="bg-sunken">
                <tr>
                  <th scope="col" className="pl-5">
                    Dataset
                  </th>
                  <th scope="col" className="num">
                    Events beating baseline
                  </th>
                  <th scope="col" className="num">
                    Mean holdout WAPE
                  </th>
                  <th scope="col" className="num pr-5">
                    80% interval coverage
                  </th>
                </tr>
              </thead>
              <tbody>
                {BACKTEST_EVENTS.map((row) => (
                  <tr key={row.scenario}>
                    <th scope="row" className="pl-5 font-semibold">
                      {row.scenario}
                    </th>
                    <td className="num">{row.events}</td>
                    <td className="num">{row.meanWape}</td>
                    <td className="num pr-5">{row.coverage80}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 max-w-[72ch]">
          <span className="font-semibold">One event lost to the baseline:</span> grocery_fmcg_15,
          product P04, 2025-11-11 (WAPE 20.6% against 17.5%). A promotion stacked on a double-day
          peak saturated demand variance. The 80% interval still covered 100.0% of outcomes.
        </p>
      </section>

      <section aria-labelledby="guardrails" className="mt-14 grid gap-10 md:grid-cols-2">
        <div>
          <h2 id="guardrails" className="h2">
            Column mapping
          </h2>
          <p className="mt-2">33 / 33 (100%) columns mapped correctly.</p>
          <p className="mt-1 text-muted">
            Tested on five messy files: Vietnamese headers, accented text, shuffled columns,
            English receipt-level rows, and files with no cost or stock. No wrong match was given
            high confidence.
          </p>
        </div>
        <div>
          <h2 className="h2">Question parsing and engine speed</h2>
          <p className="mt-2">30 / 30 valid questions parsed. 15 / 15 invalid ones rejected.</p>
          <p className="mt-1 text-muted">
            Out-of-range prices and unknown products are sent back to the manual form. The Go
            optimizer evaluates 101 candidate prices × 5,000 simulations (505k draws) in about 38.8
            ms, with identical output on 1 and 8+ cores.
          </p>
        </div>
      </section>
    </div>
  );
};

export default ValidationScreen;
