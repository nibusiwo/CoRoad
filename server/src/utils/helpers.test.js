const { calcDistance, calcRouteMatch, toMysqlDatetime } = require('./helpers');

describe('geospatial helpers', () => {
  test('distance is zero for the same coordinate', () => {
    expect(calcDistance(121.5, 31.2, 121.5, 31.2)).toBe(0);
  });

  test('route match is bounded between zero and one hundred', () => {
    const route = {
      start_point: { lng: 121.5, lat: 31.2 },
      end_point: { lng: 121.8, lat: 31.4 },
    };
    expect(calcRouteMatch(route, route)).toBe(100);
  });
});

describe('datetime helpers', () => {
  test('converts ISO datetime to MySQL DATETIME format', () => {
    expect(toMysqlDatetime('2026-08-06T03:49:16.704Z')).toBe('2026-08-06 03:49:16');
  });

  test('keeps MySQL DATETIME strings unchanged', () => {
    expect(toMysqlDatetime('2026-08-06 11:49:16')).toBe('2026-08-06 11:49:16');
  });

  test('returns null for invalid datetime values', () => {
    expect(toMysqlDatetime('not-a-date')).toBeNull();
  });
});
