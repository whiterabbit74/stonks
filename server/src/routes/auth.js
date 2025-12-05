/**
 * Authentication routes
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

router.post('/login', auth.handleLogin);
router.get('/auth/check', auth.handleAuthCheck);
router.post('/logout', auth.handleLogout);
router.post('/auth/hash-password', auth.handleHashPassword);

module.exports = router;
