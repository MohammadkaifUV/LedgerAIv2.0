const express = require('express');
const router = express.Router();
const { processUpload } = require('../controllers/bulkController');
const { bulkUploadStatements } = require('../controllers/uploadController');
const { recategorizeTransaction, approveTransaction, bulkApproveTransactions, manualCategorizeTransaction } = require('../controllers/transactionController');
const authMiddleware = require('../middleware/authMiddleware');

// 🛡️ Route: POST /upload-bulk
// Atomically uploads and stages a batch of transactions from a statement file.
router.post('/upload-bulk', authMiddleware, bulkUploadStatements);

// 🛡️ Route: POST /categorize-bulk
// Processes a batch of parsed transactions using the waterfall categorization pipeline.
router.post('/categorize-bulk', authMiddleware, processUpload);

// 🛡️ Route: PATCH /:id/recategorize
// Updates a transaction with a new offset_account_id and marks as USER_MANUAL.
// Body: { offset_account_id: number }
router.patch('/:id/recategorize', authMiddleware, recategorizeTransaction);

// 🛡️ Route: PATCH /:id/approve
// Updates a transaction to mark as approved and posted.
router.patch('/:id/approve', authMiddleware, approveTransaction);

// 🛡️ Route: POST /approve-bulk
// Approves and posts multiple transactions in bulk.
// Body: { transaction_ids: [id1, id2, ...] }
router.post('/approve-bulk', authMiddleware, bulkApproveTransactions);

// 🛡️ Route: POST /manual-categorize
// Creates a transaction row from an uncategorized transaction.
// Body: { uncategorized_transaction_id: id, offset_account_id: id }
router.post('/manual-categorize', authMiddleware, manualCategorizeTransaction);

module.exports = router;
