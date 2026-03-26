"""
Node.js client for calling the Python Parser FastAPI service
"""

const axios = require('axios');

// Configure this based on your deployment
const PARSER_API_URL = process.env.PARSER_API_URL || 'http://localhost:8001';

class ParserClient {
  constructor(baseURL = PARSER_API_URL) {
    this.client = axios.create({
      baseURL,
      timeout: 300000, // 5 minutes for long processing
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Process a document (async - returns immediately)
   * @param {number} documentId - Document ID from documents table
   */
  async processDocument(documentId) {
    try {
      const response = await this.client.post(`/api/documents/process/${documentId}`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Process a document synchronously (waits for completion)
   * @param {number} documentId - Document ID from documents table
   */
  async processDocumentSync(documentId) {
    try {
      const response = await this.client.post(`/api/documents/process-sync/${documentId}`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get document processing status
   * @param {number} documentId - Document ID
   */
  async getDocumentStatus(documentId) {
    try {
      const response = await this.client.get(`/api/documents/${documentId}/status`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get extracted transactions (CODE and LLM results)
   * @param {number} documentId - Document ID
   */
  async getTransactions(documentId) {
    try {
      const response = await this.client.get(`/api/documents/${documentId}/transactions`);
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Get recent documents
   * @param {number} limit - Max documents to return
   * @param {number} userId - Optional user ID filter
   */
  async getRecentDocuments(limit = 20, userId = null) {
    try {
      const params = { limit };
      if (userId) params.user_id = userId;

      const response = await this.client.get('/api/documents/recent', { params });
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Approve transactions and move to uncategorized_transactions
   * @param {number} documentId - Document ID
   * @param {number} accountId - Account to link transactions to
   * @param {string} selectedParser - "CODE" or "LLM"
   */
  async approveTransactions(documentId, accountId, selectedParser) {
    try {
      const formData = new URLSearchParams();
      formData.append('account_id', accountId);
      formData.append('selected_parser', selectedParser);

      const response = await this.client.post(
        `/api/documents/${documentId}/approve`,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Poll document status until processing is complete
   * @param {number} documentId - Document ID
   * @param {number} maxAttempts - Maximum polling attempts
   * @param {number} intervalMs - Polling interval in milliseconds
   */
  async waitForProcessing(documentId, maxAttempts = 60, intervalMs = 5000) {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getDocumentStatus(documentId);

      if (status.status === 'AWAITING_REVIEW' || status.status === 'APPROVED') {
        return status;
      }

      if (status.status === 'FAILED') {
        throw new Error('Document processing failed');
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Document processing timeout');
  }

  _handleError(error) {
    if (error.response) {
      // API returned an error response
      const { status, data } = error.response;
      const message = data.detail || data.message || 'Parser API error';
      const err = new Error(message);
      err.statusCode = status;
      err.details = data;
      return err;
    } else if (error.request) {
      // Request made but no response
      const err = new Error('Parser API not responding');
      err.statusCode = 503;
      return err;
    } else {
      // Something else went wrong
      return error;
    }
  }
}

module.exports = ParserClient;
