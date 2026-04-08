# MicroStream Pay

MicroStream Pay is a premium OTT-style demo application that combines local video streaming with Algorand-backed prepaid micropayments. Viewers sign up, add funds into escrow, and watch content while their in-app balance decreases in real time. The creator logs into a separate claim portal and withdraws accumulated earnings from the smart-contract escrow.

This project is built as a demo-ready full-stack application with a polished React frontend, Flask backend, MongoDB persistence, Algorand smart contract logic, and Pera Wallet integration for viewer deposits.

## What The App Does

- Viewer signup and login with JWT authentication
- Fixed creator/receiver login with a claim-only dashboard
- Prepaid OTT payment flow:
  - viewer deposits ALGO to escrow
  - playback deducts balance at a fixed per-second rate
  - creator claims earnings later from escrow
- Local HTML5 video playback for precise play, pause, resume, and stop control
- Global revenue tracking across all users
- Premium multi-page OTT frontend:
  - Home
  - Explore
  - Watchlist
  - Profile

## Core Payment Model

The current product flow is prepaid, not direct wallet-to-wallet streaming.

Money moves like this:

1. Viewer deposits funds into the Algorand escrow app address
2. Watching updates internal accounting and platform stats
3. Creator claims accumulated earnings from escrow

This means:

- Deposit: `Viewer -> Escrow`
- Watching: `No direct on-chain transfer`
- Claim: `Escrow -> Creator`

## Roles

### Viewer

- Can sign up and log in
- Connects Pera Wallet
- Adds funds
- Watches local video clips
- Uses watchlist, explore, and profile pages

### Creator / Receiver

There is one fixed receiver account for the demo:

- Name: `mithun`
- Email: `kvmithun1234@gmail.com`
- Role: `receiver`
- Wallet: `AL3JJ527I262UMN6BKSZM2B3PKYM2LHILXFE4EXBZXYJDGYC2VBBEIA3TY`

The receiver:

- does not sign up
- logs in manually
- sees only the claim dashboard
- claims earnings from escrow

## Features

### Viewer Experience

- Premium OTT landing and playback UI
- Local poster art and video clips
- Global watch timer across video switching
- Live deduction at a fixed rate
- Deposit verification through Algorand transaction confirmation
- Watchlist and explore pages
- Profile page for balance, usage, and payment info

### Creator Experience

- Separate claim dashboard
- Total claimed amount
- Remaining balance in system
- Platform revenue
- Claim history with transaction references

### Platform Revenue Tracking

The backend maintains persisted global stats:

- `total_spent_all_users`
- `total_claimed`
- `total_remaining`
- `active_users`

These are updated from backend logic, not frontend-only calculations.

## Tech Stack

### Frontend

- React
- CSS with premium Glassmorphism + Minimal Luxury styling
- HTML5 video player
- Pera Wallet integration

### Backend

- Flask
- MongoDB
- JWT authentication
- Bcrypt password hashing

### Blockchain

- Algorand TestNet
- PyTeal / TEAL smart contract
- Escrow app for creator payout flow

## Current Algorand Details

- Network: `Algorand TestNet`
- Current escrow app id: `758498032`
- Escrow app address: `FZIAMILXMAUIKFN2DO3734C36UCDEAUXK2LOGTN6JTBVFHIHGP5TJXO3TQ`

## Local Project Structure

```text
micropay-stream/
├── backend/
├── contract/
├── frontend/
├── scripts/
├── requirements.txt
├── README.md
└── .env
```

## Frontend Assets

Local video clips and banners are served from:

- `frontend/public/images/`
- `frontend/public/videos/`

The HTML5 player depends on those local files for the final OTT demo experience.

## How To Run Locally

### 1. Backend

From the project root:

```bash
source venv/bin/activate
venv/bin/python backend/app.py
```

Backend runs on:

`http://127.0.0.1:5050`

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm start
```

Frontend runs on:

`http://localhost:3000`

## Environment Configuration

Typical `.env` values used by this project include:

```env
JWT_SECRET=batman_secret_key_2026
ALGOD_ADDRESS=https://testnet-api.algonode.cloud
ALGOD_TOKEN=
MONGO_URI=your_mongodb_uri
APP_ID=758498032
RECEIVER_ADDRESS=AL3JJ527I262UMN6BKSZM2B3PKYM2LHILXFE4EXBZXYJDGYC2VBBEIA3TY
```

Note:

- viewer transactions are signed with Pera Wallet
- creator claim currently uses the backend-controlled fixed receiver flow for the demo

## Demo Flow

### Viewer

1. Sign up or log in
2. Connect Pera Wallet
3. Add funds to escrow
4. Open a movie
5. Press play
6. Watch balance decrease in real time
7. Pause/resume without resetting session totals

### Creator

1. Log in with the fixed creator account
2. Open the claim dashboard
3. Review platform revenue and claim history
4. Click `Claim Earnings`
5. Receive payout from escrow

## Important Notes

- Very small creator claims may be swallowed by Algorand transaction fees, so the app blocks tiny claims until earnings are large enough.
- WalletConnect source-map warnings may appear during local development; these are third-party development warnings and do not mean the app is broken.
- This project is intended for TestNet/demo usage.

## Future Improvements

- Cleaner suppression of WalletConnect dev warnings
- MainNet-hardening and security review
- Better analytics for creator revenue over time
- More content metadata and editorial curation
- Multi-creator support instead of a single fixed receiver account

## Author

- Mithun

