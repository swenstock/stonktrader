require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const quoteRoutes = require('./routes/quotes');
const quoteBarsRoutes = require('./routes/quoteBars');

const app = express();
app.use(cors());
app.use(express.json());

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const CATALOG_PATH = path.join(ROOT, 'config', 'product-catalog-v2.json');

function readCatalog(){
  return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
}

app.get('/api/v2/catalog', (_req, res) => res.json(readCatalog()));
app.use('/api/quotes/bars', quoteBarsRoutes);
app.use('/api/quotes', quoteRoutes);

app.get('/api/preview-health', (_req, res) => res.json({
  ok: true,
  shell: 'meme-prize-preview-v1',
  catalogVersion: readCatalog().version,
  marketDataProvider: process.env.MARKET_DATA_PROVIDER || 'demo',
  productionMainUntouched: true
}));

// Preview owns root. Do not let public/index.html (the legacy V45 redirect shell)
// intercept '/' before the preview route.
app.get('/', (_req, res) => res.sendFile(path.join(PUBLIC, 'preview-v2', 'index.html')));
app.get('/preview', (_req, res) => res.sendFile(path.join(PUBLIC, 'preview-v2', 'index.html')));
app.get('/preview/*', (_req, res) => res.sendFile(path.join(PUBLIC, 'preview-v2', 'index.html')));
app.use(express.static(PUBLIC, { index: false }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SBC meme-prize preview running on ${PORT}`));
