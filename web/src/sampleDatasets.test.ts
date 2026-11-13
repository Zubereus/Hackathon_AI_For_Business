import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSampleCsv } from './sampleDatasets';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('synthetic sample CSVs', () => {
  it('loads the selected sales dataset as a CSV file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['date,product_id,quantity']),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = await loadSampleCsv('starter_4_products');

    expect(file.name).toBe('sales_synthetic_vn.csv');
    expect(file.type).toBe('text/csv');
    expect(file.size).toBe(new Blob(['date,product_id,quantity']).size);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('sales_synthetic_vn'));
  });

  it('resolves the SMB full operating costs CSV dataset cleanly', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(['date,product_id,marketing_cost_vnd']),
    });
    vi.stubGlobal('fetch', fetchMock);

    const file = await loadSampleCsv('smb_retail_full_ops_10');

    expect(file.name).toBe('sales_synthetic_vn.csv');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('sales_synthetic_vn'));
  });
});
