import { useEffect, useEffectEvent, useState } from "react";
import { PeraWalletConnect } from "@perawallet/connect";
import algosdk from "algosdk";
import "./App.css";
import { apiRequest } from "./api";
import { algodClient, getAppAddress } from "./algod";

function createPeraWallet() {
  return new PeraWalletConnect({ chainId: 416002, shouldShowSignTxnToast: false });
}

let peraWallet = createPeraWallet();
const textEncoder = new TextEncoder();

const defaultSignup = {
  name: "",
  email: "",
  password: "",
  role: "sender",
  wallet_address: "",
};

const defaultLogin = {
  email: "",
  password: "",
};

function formatAlgo(microalgos) {
  return `${(Number(microalgos || 0) / 1_000_000).toFixed(4)} ALGO`;
}

function formatAddress(address) {
  if (!address) {
    return "Not connected";
  }
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function clearWalletConnectSession() {
  const keys = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && (key === "walletconnect" || key.startsWith("wc@") || key.toLowerCase().includes("walletconnect"))) {
      keys.push(key);
    }
  }

  keys.forEach((key) => window.localStorage.removeItem(key));
  window.sessionStorage.removeItem("walletconnect");
}

function signerTxn(txn, signer) {
  return { txn, signers: [signer] };
}

function decodeBase64Program(program) {
  return Uint8Array.from(atob(program), (char) => char.charCodeAt(0));
}

function App() {
  const [selectedRole, setSelectedRole] = useState("sender");
  const [mode, setMode] = useState("login");
  const [signupForm, setSignupForm] = useState(defaultSignup);
  const [loginForm, setLoginForm] = useState(defaultLogin);
  const [accountAddress, setAccountAddress] = useState("");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("micropay_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [streams, setStreams] = useState([]);
  const [chainStatus, setChainStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStreamId, setSelectedStreamId] = useState(null);
  const [senderForm, setSenderForm] = useState({
    receiver: "",
    rate: "10000",
    deposit: "3",
  });

  const persistSession = useEffectEvent((payload) => {
    localStorage.setItem("micropay_token", payload.token);
    localStorage.setItem("micropay_user", JSON.stringify(payload.user));
    setUser(payload.user);
  });

  const handleWalletClosed = useEffectEvent(() => {
    setAccountAddress("");
    setStatusMessage("");
  });

  const handleDisconnect = useEffectEvent(async () => {
    try {
      if (peraWallet.isConnected) {
        await peraWallet.disconnect();
      }
    } catch (error) {
      console.warn("Wallet disconnect skipped:", error);
    }
    handleWalletClosed();
  });

  const loadDashboard = useEffectEvent(async () => {
    if (!user) {
      return;
    }

    const streamData = await apiRequest(user.role === "sender" ? "/sender/my-streams" : "/receiver/my-streams");
    const nextStreams = streamData.streams || [];
    const streamExists = nextStreams.some((stream) => String(stream.stream_id) === String(selectedStreamId));
    const nextSelectedStreamId = streamExists
      ? selectedStreamId
      : (nextStreams[0]?.stream_id || null);

    setStreams(nextStreams);
    setSelectedStreamId(nextSelectedStreamId);

    const status = nextSelectedStreamId
      ? await apiRequest(`/chain-status?app_id=${nextSelectedStreamId}`)
      : {
          app_id: null,
          app_address: "",
          sender: "",
          receiver: "",
          rate: 0,
          remaining_balance: 0,
          start_round: 0,
          end_round: null,
          last_claim_round: 0,
          owed: 0,
          status: "idle",
          status_code: 0,
          current_round: 0,
          claimable_amount: 0,
        };
    setChainStatus(status);

  });

  useEffect(() => {
    if (!user) {
      return;
    }

    loadDashboard().catch((error) => {
      setErrorMessage(error.message);
    });
  }, [user, selectedStreamId]);

  async function connectWallet() {
    try {
      setErrorMessage("");
      setStatusMessage("Opening Pera Wallet...");
      let accounts = [];

      if (accountAddress) {
        accounts = [accountAddress];
      } else if (peraWallet.isConnected) {
        accounts = (await peraWallet.reconnectSession()) || [];
      } else {
        accounts = await peraWallet.connect();
      }

      peraWallet.connector?.on("disconnect", handleWalletClosed);
      const wallet = accounts[0] || "";
      setAccountAddress(wallet);
      setSignupForm((current) => ({ ...current, wallet_address: wallet }));
      setStatusMessage("Wallet connected.");
      setErrorMessage("");
    } catch (error) {
      const message = error?.message || "Wallet connection failed.";

      if (message.includes("Missing or invalid topic field")) {
        clearWalletConnectSession();
        peraWallet = createPeraWallet();
      }

      if (error?.data?.type !== "CONNECT_MODAL_CLOSED") {
        setErrorMessage(message);
        setStatusMessage("");
      }
    }
  }

  async function handleSignup(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = await apiRequest("/signup", {
        method: "POST",
        body: JSON.stringify({ ...signupForm, role: selectedRole }),
      });
      setStatusMessage(`Account created for ${payload.user.email}. Please log in.`);
      setMode("login");
      setLoginForm({ email: signupForm.email, password: "" });
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });
      persistSession(payload);
      setStatusMessage("Login successful.");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runWalletAction({ label, transactions, waitForTxId, syncPath, syncBody }) {
    setIsSubmitting(true);
    setErrorMessage("");
    setStatusMessage(`${label} in progress...`);

    try {
      const signedTransactions = await peraWallet.signTransaction(
        [transactions.map((txn) => signerTxn(txn, accountAddress))],
        accountAddress
      );
      const submitResponse = await algodClient.sendRawTransaction(signedTransactions).do();
      const networkTxId =
        submitResponse.txId ||
        submitResponse.txid ||
        submitResponse.txID ||
        waitForTxId;

      if (!networkTxId) {
        throw new Error("Unable to determine the submitted transaction id.");
      }

      await algosdk.waitForConfirmation(algodClient, networkTxId, 12);

      const response = await apiRequest(syncPath, {
        method: "POST",
        body: JSON.stringify(syncBody),
      });
      setChainStatus(response.chain_status);
      await loadDashboard();
      setStatusMessage(`${label} confirmed. Tx ID: ${response.tx_hash}`);
    } catch (error) {
      setErrorMessage(error.message);
      setStatusMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateStream() {
    try {
      const contractSpec = await apiRequest("/contract-spec");
      const params = await algodClient.getTransactionParams().do();
      const deposit = Math.round(Number(senderForm.deposit) * 1_000_000);
      const rate = Number(senderForm.rate);
      const receiver = senderForm.receiver.trim();
      const approvalProgram = decodeBase64Program(contractSpec.approval_program);
      const clearProgram = decodeBase64Program(contractSpec.clear_program);

      const createAppTxn = algosdk.makeApplicationCreateTxnFromObject({
        sender: accountAddress,
        approvalProgram,
        clearProgram,
        onComplete: algosdk.OnApplicationComplete.NoOpOC,
        numLocalInts: 0,
        numLocalByteSlices: 0,
        numGlobalInts: 6,
        numGlobalByteSlices: 2,
        suggestedParams: params,
      });

      const signedCreateTxn = await peraWallet.signTransaction(
        [[signerTxn(createAppTxn, accountAddress)]],
        accountAddress
      );
      const createAppResponse = await algodClient.sendRawTransaction(signedCreateTxn).do();
      const createAppTxId =
        createAppResponse.txId ||
        createAppResponse.txid ||
        createAppResponse.txID ||
        createAppTxn.txID().toString();

      if (!createAppTxId) {
        throw new Error("Unable to determine the new app creation transaction id.");
      }

      const createAppResult = await algosdk.waitForConfirmation(algodClient, createAppTxId, 12);
      const newAppId = Number(
        createAppResult.applicationIndex ||
        createAppResult["application-index"] ||
        0
      );

      if (!newAppId) {
        throw new Error("Unable to create a new stream app.");
      }

      const appAddress = getAppAddress(newAppId);
      const actionParams = await algodClient.getTransactionParams().do();
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: accountAddress,
        receiver: appAddress,
        amount: deposit,
        suggestedParams: actionParams,
      });

      const appCallTxn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: accountAddress,
        appIndex: Number(newAppId),
        appArgs: [textEncoder.encode("create"), algosdk.decodeAddress(receiver).publicKey, algosdk.encodeUint64(rate)],
        suggestedParams: actionParams,
      });

      algosdk.assignGroupID([paymentTxn, appCallTxn]);

      await runWalletAction({
        label: "Create stream",
        transactions: [paymentTxn, appCallTxn],
        waitForTxId: paymentTxn.txID().toString(),
        syncPath: "/sender/create-stream",
        syncBody: {
          app_id: Number(newAppId),
          tx_id: appCallTxn.txID().toString(),
          payment_tx_id: paymentTxn.txID().toString(),
          receiver,
          rate,
          deposit,
        },
      });
      setSelectedStreamId(String(newAppId));
    } catch (error) {
      setErrorMessage(error?.message || "Unable to create stream.");
      setStatusMessage("");
      setIsSubmitting(false);
    }
  }

  async function handleClaim() {
    try {
      const params = await algodClient.getTransactionParams().do();
      params.flatFee = true;
      params.fee = 2000;

      const txn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: accountAddress,
        appIndex: Number(selectedStreamId),
        appArgs: [textEncoder.encode("claim")],
        accounts: [accountAddress],
        suggestedParams: params,
      });

      await runWalletAction({
        label: "Claim",
        transactions: [txn],
        waitForTxId: txn.txID().toString(),
        syncPath: "/receiver/claim",
        syncBody: { app_id: Number(selectedStreamId), tx_id: txn.txID().toString() },
      });
    } catch (error) {
      setErrorMessage(error?.message || "Unable to claim funds.");
      setStatusMessage("");
      setIsSubmitting(false);
    }
  }

  async function handleSenderAction(action, label) {
    try {
      const params = await algodClient.getTransactionParams().do();
      const txn = algosdk.makeApplicationNoOpTxnFromObject({
        sender: accountAddress,
        appIndex: Number(selectedStreamId),
        appArgs: [textEncoder.encode(action)],
        suggestedParams: params,
      });

      await runWalletAction({
        label,
        transactions: [txn],
        waitForTxId: txn.txID().toString(),
        syncPath: `/sender/${action}-stream`,
        syncBody: { app_id: Number(selectedStreamId), tx_id: txn.txID().toString() },
      });
    } catch (error) {
      setErrorMessage(error?.message || `Unable to ${action} stream.`);
      setStatusMessage("");
      setIsSubmitting(false);
    }
  }

  async function handlePause() {
    await handleSenderAction("pause", "Pause stream");
  }

  async function handleResume() {
    await handleSenderAction("resume", "Resume stream");
  }

  async function handleStop() {
    await handleSenderAction("stop", "Stop stream");
  }

  function handleLogout() {
    localStorage.removeItem("micropay_token");
    localStorage.removeItem("micropay_user");
    setUser(null);
    setStreams([]);
    setChainStatus(null);
    setStatusMessage("");
  }

  const walletMatchesUser = user && accountAddress && user.wallet_address === accountAddress;
  const isSender = user?.role === "sender";
  const currentStream = streams.find((stream) => String(stream.stream_id) === String(selectedStreamId)) || null;
  const remainingBalance = currentStream?.remaining_balance ?? chainStatus?.remaining_balance ?? 0;
  const totalDeposit = currentStream?.total_deposit ?? 0;
  const totalClaimed = currentStream?.claimed_amount ?? Math.max(totalDeposit - remainingBalance, 0);
  const statusCode = chainStatus?.status_code;
  const isIdle = statusCode === 0;
  const isActive = statusCode === 1;
  const isPaused = statusCode === 2;
  const isStopped = statusCode === 3;
  const canStartStream = true;

  function switchRole(role) {
    setSelectedRole(role);
    setSignupForm((current) => ({ ...current, role }));
  }

  if (!user) {
    return (
      <main className="app-shell">
        <section className="hero-card auth-card">
          <div className="hero-topline">
            <p className="eyebrow">Micropay Stream</p>
            <span className="role-badge">Choose role, then continue</span>
          </div>

          <h1>Role-Based Streaming Micropayments</h1>
          <p className="hero-copy">
            First choose whether you are a sender or receiver. Then log in, or sign up if you do not have an account yet.
          </p>

          <div className="role-picker">
            <button
              className={`button ${selectedRole === "sender" ? "primary" : "ghost"}`}
              onClick={() => switchRole("sender")}
            >
              Sender
            </button>
            <button
              className={`button ${selectedRole === "receiver" ? "primary" : "ghost"}`}
              onClick={() => switchRole("receiver")}
            >
              Receiver
            </button>
          </div>

          <div className="panel-grid auth-grid">
            <article className="panel">
              <p className="eyebrow">{selectedRole === "sender" ? "Sender Access" : "Receiver Access"}</p>
              <h2>{mode === "signup" ? `Sign Up as ${selectedRole}` : `Login as ${selectedRole}`}</h2>

              {mode === "signup" ? (
                <form className="form-stack" onSubmit={handleSignup}>
                  <label className="field">
                    <span>Name</span>
                    <input value={signupForm.name} onChange={(event) => setSignupForm({ ...signupForm, name: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input value={signupForm.email} onChange={(event) => setSignupForm({ ...signupForm, email: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input type="password" value={signupForm.password} onChange={(event) => setSignupForm({ ...signupForm, password: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Selected Role</span>
                    <input value={selectedRole} disabled />
                  </label>
                  <label className="field">
                    <span>Wallet Address</span>
                    <input value={signupForm.wallet_address} onChange={(event) => setSignupForm({ ...signupForm, wallet_address: event.target.value })} />
                  </label>
                  <div className="hero-actions">
                    <button type="button" className="button secondary" onClick={connectWallet}>
                      Connect Pera Wallet
                    </button>
                    <button type="submit" className="button primary" disabled={isSubmitting}>
                      Create Account
                    </button>
                  </div>
                  <p className="auth-switch">
                    Already have an account?{" "}
                    <button type="button" className="text-button" onClick={() => setMode("login")}>
                      Login
                    </button>
                  </p>
                </form>
              ) : (
                <form className="form-stack" onSubmit={handleLogin}>
                  <label className="field">
                    <span>Email</span>
                    <input value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
                  </label>
                  <button type="submit" className="button primary" disabled={isSubmitting}>
                    Login
                  </button>
                  <p className="auth-switch">
                    Don&apos;t have an account?{" "}
                    <button type="button" className="text-button" onClick={() => setMode("signup")}>
                      Sign Up
                    </button>
                  </p>
                </form>
              )}

              {(statusMessage || errorMessage) && (
                <div className={`status-box ${errorMessage ? "status-error" : "status-success"}`}>
                  <p>{errorMessage || statusMessage}</p>
                </div>
              )}
            </article>

            <article className="panel">
              <p className="eyebrow">Flow</p>
              <h2>System Rules</h2>
              <div className="notes">
                <p>Sender: connect wallet, create and fund a stream, then pause, resume, or stop accrual.</p>
                <p>Receiver: connect wallet and claim earned funds. Claim is the only action that moves money.</p>
                <p>Blockchain is the source of truth for funds. MongoDB stores users, streams, and history.</p>
              </div>
            </article>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-topline">
          <p className="eyebrow">Authenticated Dashboard</p>
          <span className={`pill ${walletMatchesUser ? "pill-live" : "pill-muted"}`}>
            {walletMatchesUser ? `${user.role} wallet verified` : `${user.role} wallet pending`}
          </span>
        </div>
        <h1>Micropay Stream Control Room</h1>
        <p className="hero-copy">
          Logged in as {user.name} ({user.role}). MongoDB tracks your streams and transaction history while Algorand holds the real funds.
        </p>
        <div className="hero-actions">
          <button className="button secondary" onClick={connectWallet}>Connect Pera Wallet</button>
          {accountAddress ? <button className="button ghost" onClick={handleDisconnect}>Disconnect {formatAddress(accountAddress)}</button> : null}
          <button className="button ghost" onClick={loadDashboard}>Refresh</button>
          <button className="button ghost" onClick={handleLogout}>Logout</button>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span className="stat-label">Role</span>
          <strong>{user.role}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">Wallet Match</span>
          <strong>{walletMatchesUser ? "Verified" : "Mismatch"}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">On-chain Status</span>
          <strong>{chainStatus?.status || "Loading"}</strong>
        </article>
        <article className="stat-card">
          <span className="stat-label">{isSender ? "Remaining Balance" : "Claimable Now"}</span>
          <strong>{formatAlgo(isSender ? remainingBalance : (chainStatus?.claimable_amount || 0))}</strong>
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">User & Chain</p>
              <h2>Current Session</h2>
            </div>
            <span className="role-badge">{user.role}</span>
          </div>
          <dl className="details-list">
            <div><dt>Name</dt><dd>{user.name}</dd></div>
            <div><dt>Email</dt><dd>{user.email}</dd></div>
            <div><dt>Stored Wallet</dt><dd>{user.wallet_address}</dd></div>
            <div><dt>Connected Wallet</dt><dd>{accountAddress || "Not connected"}</dd></div>
            <div><dt>Stream ID</dt><dd>{chainStatus?.app_id || "-"}</dd></div>
            <div><dt>App Address</dt><dd>{chainStatus?.app_address || "-"}</dd></div>
            <div><dt>Sender</dt><dd>{chainStatus?.sender || "-"}</dd></div>
            <div><dt>Receiver</dt><dd>{chainStatus?.receiver || "-"}</dd></div>
            <div><dt>Rate</dt><dd>{chainStatus?.rate || 0} microAlgos / round</dd></div>
            <div><dt>Total Deposited</dt><dd>{formatAlgo(totalDeposit)}</dd></div>
            {isSender ? <div><dt>Remaining Balance</dt><dd>{formatAlgo(remainingBalance)}</dd></div> : null}
            <div><dt>Total Claimed</dt><dd>{formatAlgo(totalClaimed)}</dd></div>
            <div><dt>Claimable Now</dt><dd>{formatAlgo(chainStatus?.claimable_amount || 0)}</dd></div>
            <div><dt>Stopped At Round</dt><dd>{chainStatus?.end_round || "-"}</dd></div>
          </dl>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">{isSender ? "Sender Controls" : "Receiver Controls"}</p>
              <h2>{isSender ? "Manage Streams" : "Claim Incoming Funds"}</h2>
            </div>
          </div>

          {isSender ? (
            <>
              <label className="field">
                <span>Receiver Address</span>
                <input
                  value={senderForm.receiver}
                  onChange={(event) => {
                    setSenderForm({ ...senderForm, receiver: event.target.value });
                  }}
                />
              </label>
              <label className="field">
                <span>Rate (microAlgos / round)</span>
                <input
                  value={senderForm.rate}
                  onChange={(event) => {
                    setSenderForm({ ...senderForm, rate: event.target.value });
                  }}
                />
              </label>
              <label className="field">
                <span>Deposit (ALGO)</span>
                <input
                  value={senderForm.deposit}
                  onChange={(event) => {
                    setSenderForm({ ...senderForm, deposit: event.target.value });
                  }}
                />
              </label>
              <div className="hero-actions">
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => setSenderForm({ receiver: "", rate: "10000", deposit: "3" })}
                >
                  Clear Form
                </button>
                <button
                  type="button"
                  className="button ghost"
                  onClick={() =>
                    setSenderForm({
                      receiver: chainStatus?.receiver || "",
                      rate: chainStatus?.rate ? String(chainStatus.rate) : "10000",
                      deposit: senderForm.deposit,
                    })
                  }
                >
                  Copy Selected Stream
                </button>
              </div>
              <div className="notes">
                <p>Stopping a stream only freezes accrual. It does not pay the receiver or refund the sender.</p>
                <p>Any remaining funds stay locked in the contract until the receiver claims them.</p>
                <p>Each new start creates a brand new isolated stream app, so one sender's stream will not block another sender.</p>
              </div>
              <div className="action-grid">
                <button className="button primary" disabled={!walletMatchesUser || isSubmitting || !canStartStream} onClick={handleCreateStream}>Start Stream</button>
                <button className="button secondary" disabled={!walletMatchesUser || isSubmitting || !selectedStreamId || !isActive} onClick={handlePause}>Pause</button>
                <button className="button secondary" disabled={!walletMatchesUser || isSubmitting || !selectedStreamId || !isPaused} onClick={handleResume}>Resume</button>
                <button className="button danger" disabled={!walletMatchesUser || isSubmitting || !selectedStreamId || (!isActive && !isPaused)} onClick={handleStop}>Stop</button>
              </div>
            </>
          ) : (
            <>
              <div className="notes">
                <p>Connect the receiver wallet that matches your account to claim from active or stopped streams.</p>
                <p>Stopped streams do not auto-settle. Claim is still required to withdraw earned funds.</p>
              </div>
              <div className="action-grid">
                <button className="button primary" disabled={!walletMatchesUser || isSubmitting || !selectedStreamId || !(chainStatus?.claimable_amount > 0)} onClick={handleClaim}>Claim Funds</button>
              </div>
            </>
          )}

          {(statusMessage || errorMessage) && (
            <div className={`status-box ${errorMessage ? "status-error" : "status-success"}`}>
              <p>{errorMessage || statusMessage}</p>
            </div>
          )}
        </article>
      </section>

      <section className="panel-grid">
        <article className="panel">
          <p className="eyebrow">MongoDB Streams</p>
          <h2>{isSender ? "Streams You Created" : "Streams Assigned To You"}</h2>
          <div className="stream-list">
            {streams.length ? streams.map((stream) => (
              <button
                type="button"
                className="stream-row"
                key={stream._id || stream.stream_id}
                onClick={() => setSelectedStreamId(String(stream.stream_id))}
              >
                <strong>{stream.stream_id}</strong>
                <span>{stream.status}</span>
                <span>{formatAlgo(stream.total_deposit)}</span>
                <span>{formatAlgo(stream.remaining_balance)}</span>
                <span>{formatAlgo(stream.claimed_amount)}</span>
                <span>{String(stream.stream_id) === String(chainStatus?.app_id) ? formatAlgo(chainStatus?.claimable_amount || 0) : formatAlgo(0)}</span>
              </button>
            )) : <p className="empty-state">No streams in MongoDB yet.</p>}
          </div>
          <div className="notes">
            <p>Row order: stream id, status, total deposited, remaining balance, total claimed, claimable now.</p>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
