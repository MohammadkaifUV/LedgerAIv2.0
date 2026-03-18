const express = require('express');
const router = express.Router();
const { deleteModule } = require('../qc/qcController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireQC } = require('../middleware/roleMiddleware');

router.delete('/modules/:id', authMiddleware, requireQC, deleteModule);

module.exports = router;
