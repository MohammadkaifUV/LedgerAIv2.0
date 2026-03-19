const express = require('express');
const router = express.Router();
const { deleteModule } = require('../qc/qcController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireQC } = require('../middleware/roleMiddleware');
const rulesEngineService = require('../services/rulesEngineService');

router.delete('/modules/:id', authMiddleware, requireQC, deleteModule);

// Hot-reload rules endpoint
router.post('/reload-rules', authMiddleware, requireQC, async (req, res) => {
  try {
    await rulesEngineService.loadRules();
    res.json({ success: true, message: 'Rules reloaded successfully' });
  } catch (err) {
    console.error('Failed to reload rules:', err);
    res.status(500).json({ error: 'Failed to reload rules', details: err.message });
  }
});

module.exports = router;
