import {
  enumerateQuarters,
  parseSourceRow,
  quarterToDate,
} from './seoul-commercial-area-floating-population';

const validRow = {
  STDR_YYQU_CD: '20251',
  TRDAR_SE_CD: 'D',
  TRDAR_SE_CD_NM: '발달상권',
  TRDAR_CD: '3120213',
  TRDAR_CD_NM: '삼성중앙역',
  TOT_FLPOP_CO: 2108045,
  ML_FLPOP_CO: 1050976,
  FML_FLPOP_CO: 1057069,
  AGRDE_10_FLPOP_CO: 177021,
  AGRDE_20_FLPOP_CO: 339712,
  AGRDE_30_FLPOP_CO: 525353,
  AGRDE_40_FLPOP_CO: 491321,
  AGRDE_50_FLPOP_CO: 314451,
  AGRDE_60_ABOVE_FLPOP_CO: 260187,
  TMZON_00_06_FLPOP_CO: 389302,
  TMZON_06_11_FLPOP_CO: 433029,
  TMZON_11_14_FLPOP_CO: 354603,
  TMZON_14_17_FLPOP_CO: 351120,
  TMZON_17_21_FLPOP_CO: 369445,
  TMZON_21_24_FLPOP_CO: 210546,
  MON_FLPOP_CO: 312367,
  TUES_FLPOP_CO: 320954,
  WED_FLPOP_CO: 319586,
  THUR_FLPOP_CO: 331965,
  FRI_FLPOP_CO: 328797,
  SAT_FLPOP_CO: 255866,
  SUN_FLPOP_CO: 238511,
};

describe('Seoul commercial-area floating population importer', () => {
  it('enumerates quarters across a year boundary', () => {
    expect(enumerateQuarters('20254', '20262')).toEqual([
      '20254',
      '20261',
      '20262',
    ]);
  });

  it('converts the API quarter to the first day of its quarter', () => {
    expect(quarterToDate('20251')).toBe('2025-01-01');
    expect(quarterToDate('20264')).toBe('2026-10-01');
  });

  it('validates a source row', () => {
    expect(parseSourceRow(validRow, '20251')).toEqual(validRow);
  });

  it('rejects rows from the wrong quarter', () => {
    expect(() => parseSourceRow(validRow, '20252')).toThrow(
      'while requesting 20252',
    );
  });

  it('rejects non-integral metrics', () => {
    expect(() =>
      parseSourceRow({ ...validRow, TOT_FLPOP_CO: 1.5 }, '20251'),
    ).toThrow('TOT_FLPOP_CO');
  });
});
