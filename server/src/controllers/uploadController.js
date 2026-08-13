const { ApiResponse } = require('../utils/helpers');
const { getFileUrls } = require('../middleware/upload');

/** Unified upload response used by user, merchant, and admin clients. */
function upload(req, res) {
  if (!req.file) {
    return res.status(422).json(ApiResponse.fail('请上传文件'));
  }

  return res.json(ApiResponse.success({
    files: getFileUrls([req.file]),
    file: getFileUrls([req.file])[0],
    sandbox: process.env.INTEGRATION_MODE === 'sandbox'
  }, '上传成功'));
}

module.exports = { upload };
