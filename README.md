# 🚀 Micropayment Streaming dApp (Algorand)

A non-custodial Web3 application that enables real-time micropayment streaming on the Algorand blockchain.
Users can continuously stream payments, pause/resume flows, and claim funds securely — all enforced by a smart contract.

---

## 🧠 Problem

Traditional payment systems are rigid:

* No real-time streaming
* No fine-grained control over payments
* High trust dependency on intermediaries

This project solves that by enabling **trustless, programmable money streams**.

---

## 💡 Solution

We built a decentralized micropayment streaming system where:

* 💸 Payments accrue continuously over time
* ⏸️ Sender can pause/resume streams
* 🛑 Stop freezes accrual (no forced payout)
* 💰 Receiver claims funds anytime
* 🔐 Smart contract enforces all rules

No custody. No intermediaries. Fully on-chain logic.

---

## ⚙️ Key Features

### 🔁 Streaming Logic

* Create payment streams with defined duration
* Real-time accrual based on blockchain rounds
* Accurate tracking of:

  * total deposit
  * claimed amount
  * remaining balance
  * last claim round
  * stream status

### 🎮 Control System

* **Sender controls**

  * Create stream
  * Pause / Resume
  * Stop (freeze accrual)

* **Receiver control**

  * Claim accrued funds

### 🔐 Web3 Architecture

* Non-custodial wallet-based interaction
* Transactions signed via **Pera Wallet**
* Backend never accesses private keys

---

## 🏗️ Tech Stack

### 🧱 Blockchain

* Algorand (TestNet)
* Smart Contracts (PyTeal / TEAL)

### 🖥️ Backend

* Flask
* MongoDB
* JWT Authentication

### 🌐 Frontend

* React
* Wallet integration (Pera Wallet)
* Role-based dashboards

---

## 🔄 System Architecture

* Frontend builds transactions
* Wallet signs transactions
* Blockchain executes logic
* Backend verifies and records transactions

---

## 🧪 Current Status

✅ Smart contract deployed on Algorand TestNet
✅ Non-custodial wallet flow implemented
✅ Full sender + receiver interaction working
✅ Backend verification + DB sync complete

⚠️ Final stage:

* End-to-end validation on latest contract version
* Demo polish and stability testing

---

## 📍 Deployment Details

* **Network:** Algorand TestNet
* **App ID:** `758345227`

---

## 🚀 How It Works

1. User connects wallet
2. Sender creates a payment stream
3. Funds accrue over time on-chain
4. Sender can pause/resume/stop
5. Receiver claims funds anytime

---

## 🎯 Why This Matters

This system enables:

* Freelance time-based payments
* Subscription models without lock-in
* Real-time payroll systems
* Trustless financial agreements

---

## ⚠️ Disclaimer

This project is deployed on Algorand TestNet for demonstration purposes.
Not intended for production use without further security audits.

---

## 👨‍💻 Contributors

* Your Name

---

## ⭐ Future Improvements

* MainNet deployment
* UI/UX enhancements
* Advanced analytics dashboard
* Multi-stream management
* Gas optimization

---
