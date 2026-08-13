const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 0,
  CANCELLED: 1,
  PAID: 2,
  VERIFIED: 3,
  REFUNDING: 4,
  REFUNDED: 5,
  REFUND_FAILED: 6,
});

const ORDER_STATUS_NAMES = Object.freeze({
  [ORDER_STATUS.PENDING_PAYMENT]: 'pending_payment',
  [ORDER_STATUS.CANCELLED]: 'cancelled',
  [ORDER_STATUS.PAID]: 'paid',
  [ORDER_STATUS.VERIFIED]: 'verified',
  [ORDER_STATUS.REFUNDING]: 'refunding',
  [ORDER_STATUS.REFUNDED]: 'refunded',
  [ORDER_STATUS.REFUND_FAILED]: 'refund_failed',
});

const GROUP_BUY_STATUS = Object.freeze({
  ACTIVE: 1,
  SUCCEEDED: 2,
  FAILED: 3,
  VERIFIED: 4,
});

const GROUP_BUY_STATUS_NAMES = Object.freeze({
  [GROUP_BUY_STATUS.ACTIVE]: 'active',
  [GROUP_BUY_STATUS.SUCCEEDED]: 'succeeded',
  [GROUP_BUY_STATUS.FAILED]: 'failed',
  [GROUP_BUY_STATUS.VERIFIED]: 'verified',
});

const CERTIFICATION_STATUS = Object.freeze({
  NOT_SUBMITTED: 0,
  PENDING: 1,
  APPROVED: 2,
  REJECTED: 3,
});

const SETTLEMENT_STATUS = Object.freeze({
  PENDING: 0,
  SETTLED: 1,
  FAILED: 2,
});

function withStatusName(record, names) {
  return {
    ...record,
    status_code: record.status,
    status: names[record.status] || 'unknown',
  };
}

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_NAMES,
  GROUP_BUY_STATUS,
  GROUP_BUY_STATUS_NAMES,
  CERTIFICATION_STATUS,
  SETTLEMENT_STATUS,
  withStatusName,
};
