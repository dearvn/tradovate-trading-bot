# Tradovate Trading Bot

An automated futures trading bot that connects to [Tradovate](https://tradovate.com) via API/WebSocket, receives signals from TradingView, and executes trades using a trailing buy/sell grid strategy — with a real-time React dashboard for monitoring and configuration.

## Features

- **Automated trading** — Executes buy/sell orders based on TradingView signals (BUY, SELL, STRONG_BUY, STRONG_SELL)
- **Grid trading strategy** — Multiple entry/exit levels with configurable stoploss percentages
- **Technical indicators** — WMA, RSI, CrossUp, CrossDown signal confirmation
- **Trailing stop-loss** — Configurable max loss protection per trade
- **Real-time dashboard** — Monitor balance, open positions, P&L, win rate, and trade history
- **Strategy configuration** — Adjust all parameters from the UI without restarting
- **Slack notifications** — Alerts for order confirmations and executions
- **Job monitoring** — Built-in Bull board for queue inspection
- **Local tunnel support** — Expose bot publicly to receive TradingView webhook alerts

## Supported Contracts

| Symbol | Description |
|--------|-------------|
| ES | E-mini S&P 500 |
| NQ | E-mini Nasdaq-100 |
| MES | Micro E-mini S&P 500 |
| MNQ | Micro E-mini Nasdaq-100 |

## Tech Stack

**Backend:** Node.js, Express.js, PostgreSQL, Redis, Bull queue, WebSocket, Bunyan logging

**Frontend:** React 18, TypeScript, Vite, TailwindCSS, Radix UI, React Query, Recharts, Wouter

## Requirements

- Docker & Docker Compose
- A [Tradovate](https://tradovate.com) account (demo or live)
- A [TradingView](https://tradingview.com) account for signal alerts (optional)

## Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/dearvn/tradovate-trading-bot.git
cd tradovate-trading-bot
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Tradovate mode: "local" (demo) or "production" (live)
TRADOVATE_MODE=local

# Demo credentials
TRADOVATE_TEST_API_KEY=your_api_key
TRADOVATE_TEST_SECRET_KEY=your_secret_key

# UI login password
TRADOVATE_AUTHENTICATION_ENABLED=true
TRADOVATE_AUTHENTICATION_PASSWORD=your_password
```

### 2. Build and run

```bash
docker-compose build
docker-compose up -d
```

Access the dashboard at **http://localhost:8086**

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TRADOVATE_MODE` | `local` (demo) or `production` (live) | `local` |
| `TRADOVATE_TEST_API_KEY` | Demo API key | — |
| `TRADOVATE_TEST_SECRET_KEY` | Demo secret key | — |
| `TRADOVATE_LIVE_API_KEY` | Live API key | — |
| `TRADOVATE_LIVE_SECRET_KEY` | Live secret key | — |
| `TRADOVATE_AUTHENTICATION_ENABLED` | Enable UI login | `true` |
| `TRADOVATE_AUTHENTICATION_PASSWORD` | UI login password | — |
| `TRADOVATE_SLACK_ENABLED` | Enable Slack alerts | `false` |
| `TRADOVATE_SLACK_WEBHOOK_URL` | Slack incoming webhook URL | — |
| `TRADOVATE_LOCAL_TUNNEL_ENABLED` | Expose via local tunnel | `false` |
| `TRADOVATE_LOCAL_TUNNEL_SUBDOMAIN` | Custom tunnel subdomain | — |
| `TRADOVATE_POSTGRES_HOST` | PostgreSQL host | `postgres` |
| `TRADOVATE_POSTGRES_DATABASE` | Database name | `tradovate` |

## TradingView Integration

1. Enable local tunnel in `.env` (`TRADOVATE_LOCAL_TUNNEL_ENABLED=true`) or expose port 8086 publicly
2. In TradingView, create an alert with a webhook pointing to your bot URL
3. The bot receives `BUY`, `SELL`, `STRONG_BUY`, or `STRONG_SELL` payloads and acts accordingly

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/api/dashboard/summary` | Account balance, positions, daily P&L |
| GET | `/api/positions` | Open positions |
| DELETE | `/api/positions/:id` | Close a position |
| GET | `/api/strategy` | Current strategy configuration |
| PUT | `/api/strategy` | Update strategy settings |
| GET | `/api/strategy/performance` | Strategy performance metrics |
| GET | `/api/trades` | Trade history |
| GET | `/api/logs` | Application logs |
| POST | `/auth/login` | Authenticate |

## Development

```bash
# Install dependencies
npm install
cd frontend && npm install

# Run backend (with hot reload)
npm run dev

# Run frontend dev server
cd frontend && npm run dev

# Run tests
npm test

# Database migrations
npm run migrate:up
npm run migrate:down
```

## Docker Commands

```bash
# Build and start all services
docker-compose build && docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Project Structure

```
tradovate-trading-bot/
├── app/
│   ├── server.js                    # Main entry point
│   ├── server-tradovate.js          # WebSocket connection to Tradovate
│   ├── server-cronjob.js            # Trading job scheduler
│   ├── server-frontend.js           # Express API + UI server
│   ├── tradovate/                   # Tradovate API client
│   ├── cronjob/
│   │   ├── trailingTradeHelper/     # Core strategy logic
│   │   └── trailingTradeIndicator/  # Technical indicator calculations
│   ├── frontend/
│   │   ├── webserver/               # REST API routes
│   │   └── bull-board/              # Job queue monitor UI
│   └── helpers/                     # Postgres, Redis, logger, Slack
├── frontend/                        # React dashboard (Vite + TypeScript)
│   └── src/
│       ├── pages/                   # Dashboard, TradeHistory, Settings, Logs
│       ├── components/              # UI components
│       └── hooks/                   # Data fetching hooks
├── config/                          # Strategy defaults
├── migrations/                      # PostgreSQL migrations
├── docker-compose.yml
└── .env.example
```

## Roadmap

### v1.x — Current (Core Bot)
- [x] Tradovate OAuth + direct auth connection
- [x] WebSocket real-time market data feed
- [x] Trailing buy/sell grid strategy
- [x] TradingView signal integration (BUY, SELL, STRONG_BUY, STRONG_SELL)
- [x] WMA, RSI, CrossUp, CrossDown indicators
- [x] PostgreSQL trade/order persistence
- [x] Redis caching layer
- [x] Bull job queue with monitoring UI
- [x] React dashboard — balance, positions, P&L, win rate
- [x] Trade history & application logs pages
- [x] Strategy settings UI (live config without restart)
- [x] Slack notifications for order events
- [x] JWT authentication with rate limiting
- [x] Local tunnel support for TradingView webhooks
- [x] Docker Compose deployment

---

### v2.0 — Strategy & Reliability
- [ ] **Contract auto-rotation** — Automatically roll over quarterly contracts (ESZ2 → ESH3 → etc.) on expiry
- [ ] **Backtesting engine** — Replay historical candles against the current strategy before going live
- [ ] **Paper trading mode** — Simulate trades with live market data without placing real orders
- [ ] **Additional indicators** — MACD, Bollinger Bands, EMA, VWAP
- [ ] **Multi-symbol dashboard** — View all active contracts side-by-side on one screen
- [ ] **Stop-loss improvements** — Trailing stop as a price distance, not just a fixed percentage

---

### v2.1 — Notifications & Observability
- [ ] **Telegram / Discord alerts** — Alternative to Slack for order and error notifications
- [ ] **Email notifications** — Daily P&L summary and trade alerts via email
- [ ] **Performance analytics** — Sharpe ratio, max drawdown chart, equity curve graph
- [ ] **Trade journaling** — Add notes to individual trades; export to CSV/Excel
- [ ] **Alert on connection loss** — Notify immediately if Tradovate WebSocket drops

---

### v2.2 — Multi-Account & Security
- [ ] **Multi-account support** — Manage multiple Tradovate accounts from one dashboard
- [ ] **Role-based access** — Read-only viewer vs. full admin UI access
- [ ] **Audit log** — Track every manual config change and who made it
- [ ] **2FA for UI login** — TOTP-based two-factor authentication

---

### v3.0 — Platform Expansion
- [ ] **Interactive Brokers integration** — Trade equities and options in addition to futures
- [ ] **TD Ameritrade / Schwab API** — Alternate broker support
- [ ] **Crypto futures** — Binance or Bybit perpetual contracts
- [ ] **Options trading** — Basic call/put order support on supported brokers
- [ ] **Strategy marketplace** — Import/export named strategy presets as JSON

---

> Feature requests and contributions welcome — open an issue or PR.

## License

MIT
