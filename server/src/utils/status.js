const { ORDER_STATUS_NAMES } = require('../constants/statuses');

function orderStatus(status) {
  return { status: ORDER_STATUS_NAMES[status] || 'unknown', status_code: status };
}

module.exports = { orderStatus };
