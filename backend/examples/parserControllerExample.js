"""
Example usage of the Parser API from Node.js controllers
"""

const ParserClient = require('../services/parserClient');
const parserClient = new ParserClient();

/**
 * Example: Process document after upload
 */
async function handleDocumentUpload(req, res) {
  try {
    const { documentId } = req.body;

    // Start processing asynchronously
    const result = await parserClient.processDocument(documentId);

    res.json({
      success: true,
      message: 'Document processing started',
      data: result
    });
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Example: Get document status
 */
async function getDocumentStatus(req, res) {
  try {
    const { documentId } = req.params;

    const status = await parserClient.getDocumentStatus(documentId);

    res.json({
      success: true,
      data: status
    });
  } catch (error) {
    console.error('Error fetching status:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Example: Get transactions for review
 */
async function getTransactionsForReview(req, res) {
  try {
    const { documentId } = req.params;

    const transactions = await parserClient.getTransactions(documentId);

    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Example: Approve transactions
 */
async function approveTransactions(req, res) {
  try {
    const { documentId } = req.params;
    const { accountId, selectedParser } = req.body;

    const result = await parserClient.approveTransactions(
      documentId,
      accountId,
      selectedParser
    );

    res.json({
      success: true,
      message: 'Transactions approved',
      data: result
    });
  } catch (error) {
    console.error('Error approving transactions:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

/**
 * Example: Process and wait for completion
 */
async function processDocumentAndWait(req, res) {
  try {
    const { documentId } = req.body;

    // Start processing
    await parserClient.processDocument(documentId);

    // Wait for completion (polls every 5 seconds, max 5 minutes)
    const status = await parserClient.waitForProcessing(documentId);

    // Get transactions
    const transactions = await parserClient.getTransactions(documentId);

    res.json({
      success: true,
      message: 'Document processed successfully',
      data: {
        status,
        transactions
      }
    });
  } catch (error) {
    console.error('Error processing document:', error);
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message
    });
  }
}

module.exports = {
  handleDocumentUpload,
  getDocumentStatus,
  getTransactionsForReview,
  approveTransactions,
  processDocumentAndWait
};
