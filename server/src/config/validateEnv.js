const config = require('./index');

const PLACEHOLDER_PATTERNS = [
  /^your_/i,
  /^your-/i,
  /placeholder/i,
  /example/i,
  /change_in_production/i,
];

function hasRealValue(value) {
  if (value === undefined || value === null) return false;
  const text = String(value).trim();
  if (!text) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function requireValues(section, values, errors) {
  for (const [name, value] of Object.entries(values)) {
    if (!hasRealValue(value)) {
      errors.push(`${section}.${name}`);
    }
  }
}

function validateProductionEnv() {
  const mode = process.env.INTEGRATION_MODE || 'production';
  if (config.env !== 'production' || mode === 'sandbox') {
    return;
  }

  const errors = [];
  requireValues('jwt', { secret: config.jwt.secret }, errors);
  requireValues('wxpay', {
    appId: config.wxpay.appId,
    appSecret: config.wxpay.appSecret,
    mchId: config.wxpay.mchId,
    apiV3Key: config.wxpay.apiV3Key,
    privateKeyPath: config.wxpay.privateKeyPath || process.env.WX_PRIVATE_KEY,
    certSerialNo: config.wxpay.certSerialNo,
    notifyUrl: config.wxpay.notifyUrl,
  }, errors);
  requireValues('sms', {
    accessKey: config.sms.accessKey,
    accessSecret: config.sms.accessSecret,
    signName: config.sms.signName,
    templateCode: config.sms.templateCode,
  }, errors);

  if (errors.length > 0) {
    throw new Error(`Missing production integration config: ${errors.join(', ')}`);
  }
}

module.exports = {
  hasRealValue,
  validateProductionEnv,
};
