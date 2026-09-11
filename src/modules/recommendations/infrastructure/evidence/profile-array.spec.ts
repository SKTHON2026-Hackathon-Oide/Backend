import { parseProfileArray } from './profile-array';

describe('profile array normalization', () => {
  it.each([
    [['20S', '30S']],
    ['["20S","30S"]'],
    ['{20S,30S}'],
    ['{"20S","30S"}'],
  ])('normalizes %j to a usable array', (value) => {
    expect(parseProfileArray(value)?.join(', ')).toBe('20S, 30S');
  });

  it('handles the production age profile', () => {
    expect(parseProfileArray('{20S,30S,40S,50S}')).toEqual([
      '20S',
      '30S',
      '40S',
      '50S',
    ]);
  });

  it('excludes the truncated production time profile', () => {
    expect(parseProfileArray('{TIME_11_14,TIME_17_')).toBeNull();
  });

  it.each([null, undefined, [], '{}'])('handles empty values %j', (value) => {
    expect(parseProfileArray(value)).toEqual([]);
  });
});
