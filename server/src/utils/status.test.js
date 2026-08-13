const { ORDER_STATUS, ORDER_STATUS_NAMES, withStatusName } = require('../constants/statuses');

describe('V1 status contract', () => {
  test('exposes one semantic name for every order state', () => {
    expect(Object.keys(ORDER_STATUS_NAMES)).toHaveLength(7);
    expect(ORDER_STATUS_NAMES[ORDER_STATUS.PENDING_PAYMENT]).toBe('pending_payment');
    expect(ORDER_STATUS_NAMES[ORDER_STATUS.REFUND_FAILED]).toBe('refund_failed');
  });

  test('preserves numeric compatibility through status_code', () => {
    expect(withStatusName({ id: 7, status: ORDER_STATUS.PAID }, ORDER_STATUS_NAMES)).toEqual({
      id: 7,
      status: 'paid',
      status_code: ORDER_STATUS.PAID,
    });
  });
});
