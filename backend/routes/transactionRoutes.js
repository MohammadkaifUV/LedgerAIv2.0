const express = require('express');
const router = express.Router();
const { processUpload } = require('../controllers/bulkController');
const { bulkUploadStatements } = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authMiddleware');

// 🛡️ Route: POST /upload-bulk
// Atomically uploads and stages a batch of transactions from a statement file.
router.post('/upload-bulk', authMiddleware, bulkUploadStatements);

// 🛡️ Route: POST /categorize-bulk
// Processes a batch of parsed transactions using the waterfall categorization pipeline.
router.post('/categorize-bulk', authMiddleware, processUpload);

module.exports = router;
