'use strict';

const crypto = require('crypto');

function md5Upper(input) {
  return crypto.createHash('md5').update(input).digest('hex').toUpperCase();
}

function buildSignature({ path, query = {}, bodyString = '', headersToSign, appSecret }) {
  const merged = new Map();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue;
    merged.set(key, String(value));
  }
  for (const [key, value] of Object.entries(headersToSign || {})) {
    if (value === undefined || value === null || value === '') continue;
    merged.set(key, String(value));
  }

  const sorted = [...merged.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const str1 = sorted.map(([key, value]) => `${key}=${value}`).join('&');
  const str2 = bodyString ? md5Upper(bodyString) : '';
  const str3 = bodyString ? `${path}&${str1}&${str2}` : `${path}&${str1}`;
  const encodedString = encodeURIComponent(str3);
  return crypto
    .createHmac('sha1', `${appSecret}&`)
    .update(encodedString)
    .digest('base64');
}

module.exports = { buildSignature, md5Upper };
