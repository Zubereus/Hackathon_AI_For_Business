export interface SampleCsvDataset {
  id: string;
  title: string;
  description: string;
  csvPath: string;
  group: 'sales' | 'mapping';
}

export const SAMPLE_CSV_DATASETS: SampleCsvDataset[] = [
  {
    id: 'starter_4_products',
    title: 'Starter Retail Dataset',
    description: 'Four products for an initial workflow evaluation.',
    csvPath: 'out/starter_4_products/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'fashion_shop_12',
    title: 'Fashion Retail Dataset',
    description: 'Twelve apparel products with seasonal events and promotions.',
    csvPath: 'out/fashion_shop_12/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'smb_retail_full_ops_10',
    title: 'SMB Retail with Operating Costs (Marketing, Labor & Overhead)',
    description: 'Ten shop SKUs including daily ad spend, staff payroll, rent, platform & packaging costs.',
    csvPath: 'out/smb_retail_full_ops_10/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'grocery_fmcg_15',
    title: 'Grocery & FMCG Dataset',
    description: 'Fifteen products with lower price sensitivity and strong Tết seasonality.',
    csvPath: 'out/grocery_fmcg_15/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'electronics_home_10',
    title: 'Electronics & Home Goods Dataset',
    description: 'Ten products with higher price sensitivity and major sale events.',
    csvPath: 'out/electronics_home_10/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'marketplace_large_40',
    title: 'Multi-Category Marketplace Dataset',
    description: 'Forty products across multiple categories for larger-scale evaluation.',
    csvPath: 'out/marketplace_large_40/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'hard_low_price_variation_8',
    title: 'Low Price-Variation Evaluation Dataset',
    description: 'Eight products with limited price changes to evaluate estimate reliability and warning behavior.',
    csvPath: 'out/hard_low_price_variation_8/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'hard_event_confounded_12',
    title: 'Event-Confounded Pricing Evaluation Dataset',
    description: 'Twelve products where event-driven demand and price changes are difficult to separate.',
    csvPath: 'out/hard_event_confounded_12/sales_synthetic_vn.csv',
    group: 'sales',
  },
  {
    id: 'english_extra_columns_no_cost_no_stock',
    title: 'English Schema with Optional Fields',
    description: 'English column names with additional fields and no cost or stock columns.',
    csvPath: 'out/messy_variants/english_extra_columns_no_cost_no_stock/input.csv',
    group: 'mapping',
  },
  {
    id: 'erp_abbrev',
    title: 'ERP-Style Abbreviated Headers',
    description: 'Abbreviated column names representative of an ERP export.',
    csvPath: 'out/messy_variants/erp_abbrev/input.csv',
    group: 'mapping',
  },
  {
    id: 'price_in_thousands_name_only',
    title: 'Localized Prices and Product Names',
    description: 'Prices are expressed in thousands and products are identified by name.',
    csvPath: 'out/messy_variants/price_in_thousands_name_only/input.csv',
    group: 'mapping',
  },
  {
    id: 'receipt_level_transactions',
    title: 'Receipt-Level Transaction Data',
    description: 'Individual receipt records that require daily aggregation.',
    csvPath: 'out/messy_variants/receipt_level_transactions/input.csv',
    group: 'mapping',
  },
  {
    id: 'vn_headers_vn_numbers',
    title: 'Vietnamese Headers and Number Formats',
    description: 'Vietnamese column labels with localized number formatting.',
    csvPath: 'out/messy_variants/vn_headers_vn_numbers/input.csv',
    group: 'mapping',
  },
];

const sampleCsvUrls = import.meta.glob<string>(
  [
    '../../data/synthetic/out/*/sales_synthetic_vn.csv',
    '../../data/synthetic/out/messy_variants/*/input.csv',
  ],
  { eager: true, import: 'default', query: '?url' }
);

export async function loadSampleCsv(id: string): Promise<File> {
  const sample = SAMPLE_CSV_DATASETS.find((dataset) => dataset.id === id);
  if (!sample) {
    throw new Error(`Unknown sample dataset: ${id}`);
  }

  const assetUrl = Object.entries(sampleCsvUrls).find(([modulePath]) =>
    modulePath.endsWith(`/data/synthetic/${sample.csvPath}`)
  )?.[1];
  if (!assetUrl) {
    throw new Error(`Sample CSV is missing from the frontend build: ${sample.csvPath}`);
  }

  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw new Error(`Could not load sample CSV (${response.status}): ${sample.title}`);
  }

  const blob = await response.blob();
  return new File([blob], sample.csvPath.split('/').pop() ?? `${id}.csv`, {
    type: 'text/csv',
  });
}
