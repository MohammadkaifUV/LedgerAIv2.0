const express = require('express');
const cors = require('cors');
require('dotenv').config();

const transactionRoutes = require('./routes/transactionRoutes');
const qcRoutes = require('./routes/qcRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 🛡️ MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json()); // Essential for parsing JSON batches

// ==========================================
// 🛣️ ROUTES MOUNTING
// ==========================================
app.use('/api/transactions', transactionRoutes);
app.use('/api/qc', qcRoutes);

// ==========================================
// 🧪 HEALTH CHECK / QC
// ==========================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'LedgerAI Backend Online' });
});

app.get('/qc', (req, res) => {
  res.status(200).send('<!DOCTYPE html><html><head><title>QC</title></head><body></body></html>');
});

app.listen(PORT, () => {
  console.log(`🚀 LedgerAI Backend running on port ${PORT}`);
});
