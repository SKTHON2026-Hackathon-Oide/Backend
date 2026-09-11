import { DataSource } from 'typeorm';
import { ReportFavoritesService } from './report-favorites.module';

describe('report favorites', () => {
  const query = jest.fn();
  const service = new ReportFavoritesService({
    query,
  } as unknown as DataSource);
  beforeEach(() => query.mockReset());

  it('accepts exactly 3MiB and rejects one extra byte before writing', async () => {
    query.mockResolvedValue([{ summary: { id: 'a' }, savedAt: new Date() }]);
    const report = { text: 'a'.repeat(3 * 1024 * 1024 - 11) };
    const input = { id: 'a', kind: 'vacancy', title: 'test', report };
    await service.save('7', input);
    expect(query.mock.calls[0][1][4]).toBe(3145728);
    query.mockClear();
    await expect(
      service.save('7', { ...input, report: { text: report.text + 'a' } }),
    ).rejects.toMatchObject({ status: 413 });
    expect(query).not.toHaveBeenCalled();
  });

  it('scopes reads and deletes to the authenticated owner', async () => {
    query.mockResolvedValue([]);
    await expect(service.get('other-user', 'a')).rejects.toMatchObject({
      status: 404,
    });
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('user_id = $1 AND favorite_id = $2'),
      ['other-user', 'a'],
    );
    await service.remove('7', 'a');
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('user_id = $1 AND favorite_id = $2'),
      ['7', 'a'],
    );
  });

  it('fetches summary only for the list', async () => {
    query.mockResolvedValue([{ summary: { id: 'a' }, savedAt: new Date() }]);
    const items = await service.list('7');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT summary, saved_at'),
      ['7'],
    );
    expect(items[0]).not.toHaveProperty('report');
    expect(items[0].hasReport).toBe(true);
  });
});
