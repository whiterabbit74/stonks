/**
 * Rate limiting middleware configuration
 */
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Increased from 100 to prevent 429 errors during normal usage
    message: 'Too many API requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress || 'unknown';
    }
});

const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: 'Too many uploads from this IP, please try again later.',
    trustProxy: true,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress || 'unknown';
    }
});

module.exports = {
    apiLimiter,
    uploadLimiter,
};
