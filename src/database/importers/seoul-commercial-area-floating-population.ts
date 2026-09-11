import dataSource from '../data-source';

const SERVICE_NAME = 'VwsmTrdarFlpopQq';
const DEFAULT_FROM_QUARTER = '20251';
const DEFAULT_TO_QUARTER = '20264';
const DEFAULT_PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 250;

const sourceMetricKeys = [
  'TOT_FLPOP_CO',
  'ML_FLPOP_CO',
  'FML_FLPOP_CO',
  'AGRDE_10_FLPOP_CO',
  'AGRDE_20_FLPOP_CO',
  'AGRDE_30_FLPOP_CO',
  'AGRDE_40_FLPOP_CO',
  'AGRDE_50_FLPOP_CO',
  'AGRDE_60_ABOVE_FLPOP_CO',
  'TMZON_00_06_FLPOP_CO',
  'TMZON_06_11_FLPOP_CO',
  'TMZON_11_14_FLPOP_CO',
  'TMZON_14_17_FLPOP_CO',
  'TMZON_17_21_FLPOP_CO',
  'TMZON_21_24_FLPOP_CO',
  'MON_FLPOP_CO',
  'TUES_FLPOP_CO',
  'WED_FLPOP_CO',
  'THUR_FLPOP_CO',
  'FRI_FLPOP_CO',
  'SAT_FLPOP_CO',
  'SUN_FLPOP_CO',
] as const;

type SourceMetricKey = (typeof sourceMetricKeys)[number];
type SourceRow = Record<SourceMetricKey, number> & {
  STDR_YYQU_CD: string;
  TRDAR_SE_CD: string;
  TRDAR_SE_CD_NM: string;
  TRDAR_CD: string;
  TRDAR_CD_NM: string;
};

interface SuccessfulResponse {
  list_total_count: number;
  RESULT: { CODE: string; MESSAGE: string };
  row?: unknown[];
}

interface CliOptions {
  from: string;
  to: string;
  pageSize: number;
  dryRun: boolean;
}

export function quarterToDate(quarter: string): string {
  assertQuarter(quarter);
  const year = quarter.slice(0, 4);
  const month = (Number(quarter[4]) - 1) * 3 + 1;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function enumerateQuarters(from: string, to: string): string[] {
  assertQuarter(from);
  assertQuarter(to);
  const toOrdinal = quarterOrdinal(to);
  const result: string[] = [];

  for (let ordinal = quarterOrdinal(from); ordinal <= toOrdinal; ordinal += 1) {
    const year = Math.floor(ordinal / 4);
    const quarter = (ordinal % 4) + 1;
    result.push(`${year}${quarter}`);
  }

  if (result.length === 0) {
    throw new Error(`--from (${from}) must not be later than --to (${to}).`);
  }
  return result;
}

export function parseSourceRow(
  value: unknown,
  expectedQuarter: string,
): SourceRow {
  if (!isRecord(value)) {
    throw new Error('API row is not an object.');
  }

  const stringKeys = [
    'STDR_YYQU_CD',
    'TRDAR_SE_CD',
    'TRDAR_SE_CD_NM',
    'TRDAR_CD',
    'TRDAR_CD_NM',
  ] as const;
  for (const key of stringKeys) {
    if (typeof value[key] !== 'string' || value[key].trim() === '') {
      throw new Error(`API row has an invalid ${key}.`);
    }
  }
  if (value.STDR_YYQU_CD !== expectedQuarter) {
    throw new Error(
      `API returned quarter ${String(value.STDR_YYQU_CD)} while requesting ${expectedQuarter}.`,
    );
  }

  for (const key of sourceMetricKeys) {
    const metric = value[key];
    if (
      typeof metric !== 'number' ||
      !Number.isSafeInteger(metric) ||
      metric < 0
    ) {
      throw new Error(`API row has an invalid ${key}: ${String(metric)}.`);
    }
  }

  return value as SourceRow;
}

function assertQuarter(value: string): void {
  if (!/^\d{4}[1-4]$/.test(value)) {
    throw new Error(
      `Invalid quarter '${value}'. Expected YYYYQ, for example 20251.`,
    );
  }
}

function quarterOrdinal(value: string): number {
  return Number(value.slice(0, 4)) * 4 + Number(value[4]) - 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    from: DEFAULT_FROM_QUARTER,
    to: DEFAULT_TO_QUARTER,
    pageSize: DEFAULT_PAGE_SIZE,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (
      argument === '--from' ||
      argument === '--to' ||
      argument === '--page-size'
    ) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value.`);
      index += 1;
      if (argument === '--from') options.from = value;
      if (argument === '--to') options.to = value;
      if (argument === '--page-size') options.pageSize = Number(value);
      continue;
    }
    throw new Error(`Unknown argument '${argument}'.`);
  }

  enumerateQuarters(options.from, options.to);
  if (
    !Number.isInteger(options.pageSize) ||
    options.pageSize < 1 ||
    options.pageSize > 1000
  ) {
    throw new Error('--page-size must be an integer from 1 to 1000.');
  }
  return options;
}

function buildUrl(
  apiKey: string,
  startIndex: number,
  endIndex: number,
  quarter: string,
): string {
  const segments = [
    apiKey,
    'json',
    SERVICE_NAME,
    String(startIndex),
    String(endIndex),
    quarter,
  ].map(encodeURIComponent);
  return `http://openapi.seoul.go.kr:8088/${segments.join('/')}`;
}

async function fetchJsonWithRetry(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as unknown;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw new Error(
    `Seoul API request failed after 3 attempts: ${String(lastError)}`,
  );
}

function decodeResponse(
  payload: unknown,
  quarter: string,
): { totalCount: number; rows: SourceRow[]; noData: boolean } {
  if (!isRecord(payload))
    throw new Error('Seoul API returned a non-object response.');

  const topLevelResult = payload.RESULT;
  if (isRecord(topLevelResult)) {
    const code =
      typeof topLevelResult.CODE === 'string' ? topLevelResult.CODE : 'UNKNOWN';
    const message =
      typeof topLevelResult.MESSAGE === 'string'
        ? topLevelResult.MESSAGE
        : 'Unknown API error';
    if (code === 'INFO-200') return { totalCount: 0, rows: [], noData: true };
    throw new Error(`Seoul API error ${code}: ${message}`);
  }

  const body = payload[SERVICE_NAME];
  if (!isRecord(body) || !isRecord(body.RESULT)) {
    throw new Error(`Seoul API response does not contain ${SERVICE_NAME}.`);
  }
  const response = body as unknown as SuccessfulResponse;
  if (response.RESULT.CODE !== 'INFO-000') {
    throw new Error(
      `Seoul API error ${response.RESULT.CODE}: ${response.RESULT.MESSAGE}`,
    );
  }
  if (
    !Number.isSafeInteger(response.list_total_count) ||
    response.list_total_count < 0
  ) {
    throw new Error('Seoul API returned an invalid list_total_count.');
  }
  const rows = (response.row ?? []).map((row) => parseSourceRow(row, quarter));
  return { totalCount: response.list_total_count, rows, noData: false };
}

async function fetchQuarter(
  apiKey: string,
  quarter: string,
  pageSize: number,
): Promise<SourceRow[] | null> {
  const rows: SourceRow[] = [];
  let expectedTotal: number | undefined;

  for (
    let start = 1;
    expectedTotal === undefined || start <= expectedTotal;
    start += pageSize
  ) {
    const end = start + pageSize - 1;
    const decoded = decodeResponse(
      await fetchJsonWithRetry(buildUrl(apiKey, start, end, quarter)),
      quarter,
    );
    if (decoded.noData) return null;
    expectedTotal ??= decoded.totalCount;
    if (decoded.totalCount !== expectedTotal) {
      throw new Error(`Total count changed while downloading ${quarter}.`);
    }
    rows.push(...decoded.rows);
  }

  if (rows.length !== expectedTotal) {
    throw new Error(
      `Downloaded ${rows.length}/${expectedTotal} rows for ${quarter}.`,
    );
  }
  const uniqueKeys = new Set(rows.map((row) => row.TRDAR_CD));
  if (uniqueKeys.size !== rows.length) {
    throw new Error(
      `Seoul API returned duplicate commercial-area codes for ${quarter}.`,
    );
  }
  return rows;
}

const targetColumns = [
  'commercial_area_id',
  'base_period',
  'commercial_area_type_code',
  'commercial_area_type_name',
  'total_population',
  'male_population',
  'female_population',
  'age_10s',
  'age_20s',
  'age_30s',
  'age_40s',
  'age_50s',
  'age_60_plus',
  'time_00_06',
  'time_06_11',
  'time_11_14',
  'time_14_17',
  'time_17_21',
  'time_21_24',
  'monday_population',
  'tuesday_population',
  'wednesday_population',
  'thursday_population',
  'friday_population',
  'saturday_population',
  'sunday_population',
] as const;

function rowValues(
  row: SourceRow,
  areaId: string,
  basePeriod: string,
): unknown[] {
  return [
    areaId,
    basePeriod,
    row.TRDAR_SE_CD,
    row.TRDAR_SE_CD_NM,
    ...sourceMetricKeys.map((key) => row[key]),
  ];
}

async function upsertQuarter(
  quarter: string,
  rows: SourceRow[],
): Promise<void> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const areaRecords = (await runner.query(
      'SELECT id, commercial_area_code FROM commercial_area',
    )) as Array<{ id: string; commercial_area_code: string }>;
    const areaIds = new Map(
      areaRecords.map((area) => [area.commercial_area_code, area.id]),
    );
    const missingCodes = rows
      .filter((row) => !areaIds.has(row.TRDAR_CD))
      .map((row) => row.TRDAR_CD);
    if (missingCodes.length > 0) {
      throw new Error(
        `${quarter} contains ${missingCodes.length} area codes absent from commercial_area: ${missingCodes.slice(0, 10).join(', ')}`,
      );
    }

    const basePeriod = quarterToDate(quarter);
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
      const values: unknown[] = [];
      const tuples = batch.map((row) => {
        const tupleValues = rowValues(
          row,
          areaIds.get(row.TRDAR_CD)!,
          basePeriod,
        );
        const placeholders = tupleValues.map((value) => {
          values.push(value);
          return `$${values.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const updateColumns = targetColumns.filter(
        (column) => column !== 'commercial_area_id' && column !== 'base_period',
      );
      await runner.query(
        `INSERT INTO commercial_area_floating_population_statistic
          (${targetColumns.join(', ')})
         VALUES ${tuples.join(', ')}
         ON CONFLICT (commercial_area_id, base_period) DO UPDATE SET
          ${updateColumns.map((column) => `${column} = EXCLUDED.${column}`).join(', ')},
          fetched_at = now(), updated_at = now()`,
        values,
      );
    }
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const apiKey = process.env.SEOUL_OPEN_DATA_API_KEY?.trim();
  if (!apiKey) throw new Error('SEOUL_OPEN_DATA_API_KEY is required.');

  if (!options.dryRun) await dataSource.initialize();
  try {
    let imported = 0;
    for (const quarter of enumerateQuarters(options.from, options.to)) {
      process.stdout.write(`[${quarter}] downloading... `);
      const rows = await fetchQuarter(apiKey, quarter, options.pageSize);
      if (rows === null) {
        console.log('not published; skipped');
        continue;
      }
      if (!options.dryRun) await upsertQuarter(quarter, rows);
      imported += rows.length;
      console.log(
        `${rows.length} rows ${options.dryRun ? 'validated' : 'upserted'}`,
      );
    }
    console.log(
      `${options.dryRun ? 'Validated' : 'Imported'} ${imported} rows in total.`,
    );
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
