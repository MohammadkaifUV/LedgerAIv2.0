# LedgerAI v2.0

AI-powered personal finance management system with intelligent transaction categorization.

## Features

- 🤖 **5-Stage AI Categorization Pipeline**
  - Contra transaction detection
  - Rules engine with pattern matching
  - Personal exact cache (O(1) lookup)
  - NER-based merchant extraction
  - Vector similarity search
  - LLM batch fallback

- 📊 **Double-Entry Bookkeeping**
  - Automatic ledger entries
  - Balance validation
  - Audit trail

- 🧠 **Learning System**
  - Personal cache learns from approvals
  - Improves accuracy over time

- 🔐 **Security**
  - Supabase authentication
  - User ownership validation
  - Rate limiting
  - CORS protection

## Quick Start

```bash
# Clone repository
git clone <repo-url>
cd "LedgerAI v2.0"

# Install dependencies
cd backend && npm install
cd ../frontend-web && npm install
cd ../ml-service && pip install -r requirements.txt

# Configure environment
cp .env.example backend/.env
# Edit backend/.env with your credentials

# Start all services
./start.sh
```

Services will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- ML Service: http://localhost:5000

## LLM Provider Configuration

LedgerAI supports multiple LLM providers for transaction categorization:

### Supported Providers

1. **OpenRouter** (Default)
   - Multiple models (Gemini, Claude, GPT)
   - Pay-per-use pricing
   - Get API key: https://openrouter.ai/keys

2. **Google AI Studio**
   - Gemini models
   - Free tier available
   - Get API key: https://aistudio.google.com/app/apikey

### Configuration

Edit `backend/.env`:

```bash
# Choose provider: 'openrouter' or 'google'
LLM_PROVIDER=google

# Google AI Studio (recommended for development)
GOOGLE_API_KEY=your-google-api-key
LLM_MODEL=gemini-2.0-flash-exp

# OR OpenRouter (recommended for production)
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-key
LLM_MODEL=google/gemini-2.0-flash-exp
```

### Test Your Configuration

```bash
cd backend
node test-llm.js
```

See [LLM_PROVIDER_GUIDE.md](LLM_PROVIDER_GUIDE.md) for detailed setup instructions.

## Documentation

- [Overview](overview.md) - System architecture and pipeline details
- [Local Setup](LOCAL_SETUP.md) - Development environment setup
- [LLM Provider Guide](LLM_PROVIDER_GUIDE.md) - Configure AI providers
- [LLM Testing Guide](LLM_TESTING_GUIDE.md) - Test and troubleshoot
- [Improvements](improvements.md) - Roadmap and recommendations

## Tech Stack

- **Backend:** Node.js, Express, Supabase
- **Frontend:** React, Vite
- **ML Service:** Python, FastAPI, spaCy, SentenceTransformers
- **LLM:** OpenRouter / Google AI Studio
- **Database:** PostgreSQL (Supabase)

## Project Structure

```
LedgerAI v2.0/
├── backend/              # Node.js API server
│   ├── controllers/      # Request handlers
│   ├── services/         # Business logic
│   ├── middleware/       # Auth & validation
│   └── routes/          # API routes
├── frontend-web/        # React web app
├── frontend-mobile/     # React Native app
├── ml-service/          # Python ML service
└── schema.sql          # Database schema
```

## Contributing

See [improvements.md](improvements.md) for areas needing work.

## License

[Your License]

## Support

- Issues: [GitHub Issues](https://github.com/your-repo/issues)
- Documentation: See docs/ folder
