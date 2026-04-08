import { memo, useCallback, useEffect, useRef, useState } from "react";
import algosdk from "algosdk";
import { PeraWalletConnect } from "@perawallet/connect";
import "./App.css";
import { apiRequest } from "./api";
import { algodClient } from "./algod";

const peraWallet = new PeraWalletConnect({ chainId: 416002, shouldShowSignTxnToast: false });
const textEncoder = new TextEncoder();
const FIXED_RATE_MICROALGOS_PER_SECOND = 10;
const MIN_RECEIVER_CLAIM_MICROALGOS = 2001;

const RECEIVER_ACCOUNT = {
  name: "Mithun",
  email: "kvmithun1234@gmail.com",
  password: "mithun",
  wallet_address: "AL3JJ527I262UMN6BKSZM2B3PKYM2LHILXFE4EXBZXYJDGYC2VBBEIA3TY",
};

const MOVIES = [
  {
    id: "game-thrones",
    title: "Game of Thrones",
    subtitle: "Intro sequence",
    src: "/videos/game_thrones_intro.mp4",
    poster: "/images/got_image.jpeg",
    lengthLabel: "Intro",
    genre: "Fantasy",
    rating: "U/A 16+",
    year: "2011",
  },
  {
    id: "man-of-steel",
    title: "Man of Steel",
    subtitle: "Flight scene",
    src: "/videos/man_Of_steel_flight_scene_.mp4",
    poster: "/images/man_of_steel.jpg",
    lengthLabel: "Clip",
    genre: "Action",
    rating: "U/A 13+",
    year: "2013",
  },
  {
    id: "race-gurram",
    title: "Race Gurram",
    subtitle: "Trailer cut",
    src: "/videos/racegurram_trailer.mp4",
    poster: "/images/racegurram.jpg",
    lengthLabel: "Trailer",
    genre: "Comedy",
    rating: "U",
    year: "2014",
  },
  {
    id: "true-detective",
    title: "True Detective",
    subtitle: "Atmosphere clip",
    src: "/videos/true_detective.mp4",
    poster: "/images/true_detective.jpg",
    lengthLabel: "Scene",
    genre: "Crime",
    rating: "A",
    year: "2014",
  },
];

const NAV_ITEMS = [
  { id: "home", label: "Home" },
  { id: "explore", label: "Explore" },
  { id: "watchlist", label: "Watchlist" },
  { id: "profile", label: "Profile" },
];

const defaultSignup = {
  name: "",
  email: "",
  password: "",
  role: "user",
  wallet_address: "",
};

const defaultLogin = {
  email: "",
  password: "",
};

function formatAlgoFromMicro(microalgos) {
  return `${(Number(microalgos || 0) / 1_000_000).toFixed(5)} ALGO`;
}

function formatSeconds(totalSeconds) {
  const seconds = Math.max(Math.floor(totalSeconds || 0), 0);
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatAddress(address) {
  if (!address) {
    return "Not connected";
  }
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function signerTxn(txn, signer) {
  return { txn, signers: [signer] };
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

const VideoStage = memo(function VideoStage({ videoRef, movie, onPlay, onPause, onEnded }) {
  return (
    <div className="player-shell">
      <video
        ref={videoRef}
        width="100%"
        controls
        playsInline
        preload="metadata"
        poster={movie.poster}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
      >
        <source src={movie.src} type="video/mp4" />
      </video>
    </div>
  );
});

function App() {
  const videoRef = useRef(null);
  const resumeOnSwitchRef = useRef(false);
  const ignorePauseRef = useRef(false);
  const unsyncedSecondsRef = useRef(0);
  const flushInFlightRef = useRef(false);
  const isViewerRef = useRef(false);
  const walletMatchesRef = useRef(false);
  const balanceRef = useRef(0);
  const movieIdRef = useRef(MOVIES[0].id);

  const [portalMode, setPortalMode] = useState("viewer");
  const [authMode, setAuthMode] = useState("login");
  const [signupForm, setSignupForm] = useState(defaultSignup);
  const [loginForm, setLoginForm] = useState(defaultLogin);
  const [depositAmount, setDepositAmount] = useState("1");
  const [manualDepositTxId, setManualDepositTxId] = useState("");
  const [accountAddress, setAccountAddress] = useState("");
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("micropay_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [transactions, setTransactions] = useState([]);
  const [selectedMovieId, setSelectedMovieId] = useState(MOVIES[0].id);
  const [balanceMicroalgos, setBalanceMicroalgos] = useState(0);
  const [totalSpentMicroalgos, setTotalSpentMicroalgos] = useState(0);
  const [totalWatchedSeconds, setTotalWatchedSeconds] = useState(0);
  const [creatorSummary, setCreatorSummary] = useState(null);
  const [globalStats, setGlobalStats] = useState(null);
  const [playbackState, setPlaybackState] = useState("stopped");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [latestTx, setLatestTx] = useState(null);
  const [claimResult, setClaimResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState("home");
  const [watchlistIds, setWatchlistIds] = useState([MOVIES[1].id, MOVIES[3].id]);
  const [exploreFilter, setExploreFilter] = useState("All");

  const selectedMovie = MOVIES.find((movie) => movie.id === selectedMovieId) || MOVIES[0];
  const isViewer = user?.role === "user";
  const walletMatchesUser = Boolean(user && accountAddress && user.wallet_address === accountAddress);
  const watchlistMovies = MOVIES.filter((movie) => watchlistIds.includes(movie.id));
  const exploreMovies = exploreFilter === "All" ? MOVIES : MOVIES.filter((movie) => movie.genre === exploreFilter);

  useEffect(() => {
    isViewerRef.current = isViewer;
    walletMatchesRef.current = walletMatchesUser;
    balanceRef.current = balanceMicroalgos;
    movieIdRef.current = selectedMovieId;
  }, [isViewer, walletMatchesUser, balanceMicroalgos, selectedMovieId]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("micropay_user", JSON.stringify(user));
    }
  }, [user]);

  useEffect(() => {
    if (portalMode === "creator" && !user) {
      setAuthMode("login");
      setLoginForm(defaultLogin);
    }
  }, [portalMode, user]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    loadDashboard(user).catch((error) => setErrorMessage(error.message));
    // load on authenticated session changes only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      apiRequest("/global-stats")
        .then((stats) => setGlobalStats(stats))
        .catch(() => {});
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [user]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const handleLoaded = async () => {
      if (!resumeOnSwitchRef.current) {
        return;
      }
      resumeOnSwitchRef.current = false;
      try {
        await video.play();
      } catch (error) {
        setErrorMessage("Unable to autoplay the next clip. Press play again.");
      }
    };

    video.addEventListener("loadedmetadata", handleLoaded);
    return () => video.removeEventListener("loadedmetadata", handleLoaded);
  }, [selectedMovieId]);

  useEffect(() => {
    if (!isViewer || playbackState !== "active") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (balanceRef.current < FIXED_RATE_MICROALGOS_PER_SECOND) {
        stopForLowBalance();
        return;
      }

      balanceRef.current -= FIXED_RATE_MICROALGOS_PER_SECOND;
      setBalanceMicroalgos(balanceRef.current);
      setTotalSpentMicroalgos((current) => current + FIXED_RATE_MICROALGOS_PER_SECOND);
      setTotalWatchedSeconds((current) => current + 1);
      unsyncedSecondsRef.current += 1;
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [isViewer, playbackState]);

  async function loadDashboard(nextUser = user) {
    if (!nextUser) {
      return;
    }

    if (nextUser.role === "receiver") {
      const [payload, stats] = await Promise.all([
        apiRequest("/receiver/dashboard"),
        apiRequest("/global-stats"),
      ]);
      setCreatorSummary(payload.summary);
      setTransactions(payload.transactions || []);
      setGlobalStats(stats);
      return;
    }

    const payload = await apiRequest("/viewer/dashboard");
    hydrateViewer(payload.user);
    setTransactions(payload.transactions || []);
    setGlobalStats(payload.global_stats || null);
  }

  function hydrateViewer(nextUser) {
    setUser(nextUser);
    setBalanceMicroalgos(intValue(nextUser.balance_microalgos));
    setTotalSpentMicroalgos(intValue(nextUser.total_spent_microalgos));
    setTotalWatchedSeconds(intValue(nextUser.total_watch_seconds));
  }

  function intValue(value) {
    return Number.parseInt(value || 0, 10) || 0;
  }

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
        try {
          accounts = await peraWallet.connect();
        } catch (error) {
          const message = error?.message || "";
          if (message.includes("Session currently connected")) {
            accounts = (await peraWallet.reconnectSession()) || [];
          } else {
            throw error;
          }
        }
      }

      const wallet = accounts[0] || "";
      if (!wallet) {
        throw new Error("No wallet account returned.");
      }

      setAccountAddress(wallet);
      setSignupForm((current) => ({ ...current, wallet_address: wallet }));
      setStatusMessage("Wallet connected.");
      setErrorMessage("");
    } catch (error) {
      const message = error?.message || "Wallet connection failed.";
      if (message.includes("Missing or invalid topic field")) {
        clearWalletConnectSession();
      }
      if (error?.data?.type !== "CONNECT_MODAL_CLOSED") {
        setErrorMessage(message);
        setStatusMessage("");
      }
    }
  }

  async function disconnectWallet() {
    try {
      if (peraWallet.isConnected) {
        await peraWallet.disconnect();
      }
    } catch (error) {
      console.warn("Wallet disconnect skipped:", error);
    }
    setAccountAddress("");
    setStatusMessage("");
  }

  async function promptWalletForPlayback() {
    setErrorMessage("");
    setStatusMessage("Connect Pera Wallet to watch.");
    await connectWallet();
  }

  async function handleSignup(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const payload = await apiRequest("/signup", {
        method: "POST",
        body: JSON.stringify({ ...signupForm, role: "user" }),
      });
      setStatusMessage(`Viewer account created for ${payload.user.email}. Please log in.`);
      setAuthMode("login");
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
    setClaimResult("");
    try {
      const payload = await apiRequest("/login", {
        method: "POST",
        body: JSON.stringify(loginForm),
      });

      localStorage.setItem("micropay_token", payload.token);
      setUser(payload.user);
      setStatusMessage("Login successful.");
      if (payload.user.role === "user") {
        hydrateViewer(payload.user);
      }
      await loadDashboard(payload.user);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("micropay_token");
    localStorage.removeItem("micropay_user");
    setUser(null);
    setTransactions([]);
    setCreatorSummary(null);
    setStatusMessage("");
    setErrorMessage("");
    setClaimResult("");
    setLatestTx(null);
    setBalanceMicroalgos(0);
    setTotalSpentMicroalgos(0);
    setTotalWatchedSeconds(0);
    setPlaybackState("stopped");
    unsyncedSecondsRef.current = 0;
  }

  async function addFunds() {
    if (!walletMatchesUser) {
      await promptWalletForPlayback();
      return;
    }

    const amountMicroalgos = Math.round(Number(depositAmount || 0) * 1_000_000);
    if (!amountMicroalgos || amountMicroalgos <= 0) {
      setErrorMessage("Enter a deposit greater than 0 ALGO.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setStatusMessage("Preparing deposit...");

    try {
      const intent = await apiRequest("/viewer/deposit-intent");
      const params = await algodClient.getTransactionParams().do();
      const paymentTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
        sender: accountAddress,
        receiver: intent.receiver_address,
        amount: amountMicroalgos,
        note: textEncoder.encode(intent.payment_note),
        suggestedParams: params,
      });

      const signed = await peraWallet.signTransaction([[signerTxn(paymentTxn, accountAddress)]], accountAddress);
      const submitResponse = await algodClient.sendRawTransaction(signed).do();
      const txId =
        submitResponse.txId ||
        submitResponse.txid ||
        submitResponse.txID ||
        paymentTxn.txID().toString();

      await algosdk.waitForConfirmation(algodClient, txId, 12);
      const verified = await apiRequest("/viewer/verify-deposit", {
        method: "POST",
        body: JSON.stringify({ tx_id: txId }),
      });

      hydrateViewer(verified.user);
      await loadDashboard(verified.user);
      setManualDepositTxId("");
      setLatestTx({ action: "Deposit", txId, status: "Confirmed" });
      setStatusMessage(`Deposit credited: ${formatAlgoFromMicro(verified.deposit.amount)}`);
    } catch (error) {
      setErrorMessage(error.message);
      setStatusMessage("");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyManualDeposit() {
    if (!manualDepositTxId.trim()) {
      setErrorMessage("Paste the manual deposit tx id first.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const verified = await apiRequest("/viewer/verify-deposit", {
        method: "POST",
        body: JSON.stringify({ tx_id: manualDepositTxId.trim() }),
      });
      hydrateViewer(verified.user);
      await loadDashboard(verified.user);
      setLatestTx({ action: "Manual deposit", txId: manualDepositTxId.trim(), status: "Confirmed" });
      setStatusMessage(`Manual deposit credited: ${formatAlgoFromMicro(verified.deposit.amount)}`);
      setManualDepositTxId("");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const flushUsage = useCallback(async (force = false) => {
    if (!user || !isViewer || flushInFlightRef.current) {
      return;
    }

    const seconds = unsyncedSecondsRef.current;
    if (!seconds || (!force && playbackState !== "active")) {
      return;
    }

    flushInFlightRef.current = true;
    unsyncedSecondsRef.current = 0;
    try {
      const payload = await apiRequest("/viewer/consume", {
        method: "POST",
        body: JSON.stringify({ seconds, movie_id: movieIdRef.current }),
      });
      hydrateViewer(payload.user);
      setLatestTx({ action: "Usage sync", txId: `usage-${Date.now()}`, status: "Recorded" });
    } catch (error) {
      unsyncedSecondsRef.current += seconds;
      setErrorMessage(error.message);
      stopPlayback();
      await loadDashboard();
    } finally {
      flushInFlightRef.current = false;
    }
  }, [isViewer, user]);

  const stopPlayback = useCallback(() => {
    if (videoRef.current) {
      ignorePauseRef.current = true;
      videoRef.current.pause();
    }
    setPlaybackState("stopped");
  }, []);

  const stopForLowBalance = useCallback(() => {
    setErrorMessage("Add funds to keep watching.");
    setStatusMessage("");
    stopPlayback();
  }, [stopPlayback]);

  const handleVideoPlay = useCallback(async () => {
    if (!isViewerRef.current) {
      ignorePauseRef.current = true;
      videoRef.current?.pause();
      setErrorMessage("Only viewer accounts can watch content.");
      return;
    }

    if (!walletMatchesRef.current) {
      ignorePauseRef.current = true;
      videoRef.current?.pause();
      await promptWalletForPlayback();
      return;
    }

    if (balanceRef.current <= 0) {
      ignorePauseRef.current = true;
      videoRef.current?.pause();
      setErrorMessage("Add funds to watch.");
      setStatusMessage("");
      return;
    }

    setErrorMessage("");
    setStatusMessage("Playback active.");
    setPlaybackState("active");
  }, []);

  const handleVideoPause = useCallback(async () => {
    if (ignorePauseRef.current) {
      ignorePauseRef.current = false;
      return;
    }

    if (resumeOnSwitchRef.current) {
      return;
    }

    setPlaybackState("paused");
    await flushUsage(true);
  }, [flushUsage]);

  const handleVideoEnded = useCallback(async () => {
    setPlaybackState("stopped");
    await flushUsage(true);
  }, [flushUsage]);

  async function handleManualStop() {
    stopPlayback();
    await flushUsage(true);
  }

  function handleMovieSelect(movieId) {
    setCurrentPage("home");
    if (isViewer && !walletMatchesUser) {
      promptWalletForPlayback();
    }

    const video = videoRef.current;
    const wasPlaying = Boolean(video && !video.paused && !video.ended);
    resumeOnSwitchRef.current = wasPlaying;
    setSelectedMovieId(movieId);

    if (video) {
      ignorePauseRef.current = true;
      video.pause();
      video.load();
    }
  }

  function toggleWatchlist(movieId) {
    setWatchlistIds((current) => (
      current.includes(movieId) ? current.filter((id) => id !== movieId) : [...current, movieId]
    ));
  }

  async function claimCreatorEarnings() {
    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const payload = await apiRequest("/receiver/claim", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCreatorSummary(payload.summary);
      setClaimResult(`Claimed ${formatAlgoFromMicro(payload.claimed_microalgos)} on-chain to the receiver wallet.`);
      setLatestTx({ action: "Creator claim", txId: payload.claim_id, status: "Confirmed" });
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const statusLabel = playbackState.charAt(0).toUpperCase() + playbackState.slice(1);
  const contentRows = [
    { title: "Trending Now", items: MOVIES },
    { title: "Featured", items: [...MOVIES].reverse() },
    { title: "Continue Watching", items: MOVIES.slice(1).concat(MOVIES[0]) },
    { title: "New Releases", items: MOVIES.slice(2).concat(MOVIES.slice(0, 2)) },
  ];
  const highlightedRow = contentRows[0];
  const genreFilters = ["All", ...new Set(MOVIES.map((movie) => movie.genre))];
  const activeNavLabel = NAV_ITEMS.find((item) => item.id === currentPage)?.label || "Home";

  const viewerPageContent = {
    home: (
      <>
        {contentRows.map((row) => (
          <article className="panel content-row-panel glass-panel" key={row.title}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Content Row</p>
                <h2>{row.title}</h2>
              </div>
              <span className="role-badge">{row.items.length} titles</span>
            </div>

            <div className="content-row-scroll">
              {row.items.map((movie) => (
                <button
                  key={`${row.title}-${movie.id}`}
                  type="button"
                  className={`movie-card ott-card ${movie.id === selectedMovieId ? "movie-card-active" : ""}`}
                  onClick={() => handleMovieSelect(movie.id)}
                  style={{ backgroundImage: `linear-gradient(180deg, rgba(4, 10, 18, 0.08), rgba(4, 10, 18, 0.92)), url(${movie.poster})` }}
                >
                  <span className="movie-length">{movie.lengthLabel}</span>
                  <span className="play-overlay">Play</span>
                  <strong>{movie.title}</strong>
                  <span>{movie.subtitle}</span>
                </button>
              ))}
            </div>
          </article>
        ))}

        <article className="panel movie-panel glass-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Now Watching</p>
              <h2>{selectedMovie.title}</h2>
            </div>
            {!walletMatchesUser ? <span className="role-badge">Connect Wallet to Watch</span> : null}
          </div>

          <VideoStage
            videoRef={videoRef}
            movie={selectedMovie}
            onPlay={handleVideoPlay}
            onPause={handleVideoPause}
            onEnded={handleVideoEnded}
          />

          <div className="notes">
            <p>Rate is fixed at 0.00001 ALGO per second.</p>
            <p>Switching videos does not reset total watch time or total spent.</p>
            {!walletMatchesUser ? <p>Connect the Pera wallet tied to your viewer account before pressing play.</p> : null}
          </div>
        </article>
      </>
    ),
    explore: (
      <article className="panel glass-panel browse-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Browse Library</p>
            <h2>Explore All Content</h2>
          </div>
          <span className="role-badge">{exploreMovies.length} results</span>
        </div>
        <div className="filter-row">
          {genreFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${exploreFilter === filter ? "filter-chip-active" : ""}`}
              onClick={() => setExploreFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="explore-grid">
          {exploreMovies.map((movie) => (
            <button
              key={`explore-${movie.id}`}
              type="button"
              className={`movie-card movie-card-compact ${movie.id === selectedMovieId ? "movie-card-active" : ""}`}
              onClick={() => handleMovieSelect(movie.id)}
              style={{ backgroundImage: `linear-gradient(180deg, rgba(4, 10, 18, 0.08), rgba(4, 10, 18, 0.92)), url(${movie.poster})` }}
            >
              <span className="movie-length">{movie.genre}</span>
              <span className="play-overlay">Open</span>
              <strong>{movie.title}</strong>
              <span>{movie.year} · {movie.rating}</span>
            </button>
          ))}
        </div>
      </article>
    ),
    watchlist: (
      <article className="panel glass-panel browse-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Saved Library</p>
            <h2>Your Watchlist</h2>
          </div>
          <span className="role-badge">{watchlistMovies.length} saved</span>
        </div>
        <div className="explore-grid">
          {watchlistMovies.length ? watchlistMovies.map((movie) => (
            <div key={`watchlist-${movie.id}`} className="watchlist-card">
              <button
                type="button"
                className={`movie-card movie-card-compact ${movie.id === selectedMovieId ? "movie-card-active" : ""}`}
                onClick={() => handleMovieSelect(movie.id)}
                style={{ backgroundImage: `linear-gradient(180deg, rgba(4, 10, 18, 0.08), rgba(4, 10, 18, 0.92)), url(${movie.poster})` }}
              >
                <span className="movie-length">{movie.genre}</span>
                <span className="play-overlay">Play</span>
                <strong>{movie.title}</strong>
                <span>{movie.subtitle}</span>
              </button>
              <button type="button" className="button ghost button-inline" onClick={() => toggleWatchlist(movie.id)}>Remove</button>
            </div>
          )) : <p className="empty-state">Your watchlist is empty. Add titles from Home or Explore.</p>}
        </div>
      </article>
    ),
    profile: (
      <section className="profile-grid">
        <article className="panel glass-panel">
          <p className="eyebrow">Profile</p>
          <h2>Account Dashboard</h2>
          <div className="profile-hero">
            <div className="profile-avatar">{user?.name?.slice(0, 1)?.toUpperCase() || "U"}</div>
            <div>
              <strong>{user?.name}</strong>
              <span>{user?.email}</span>
            </div>
          </div>
          <dl className="details-list">
            <div><dt>Wallet</dt><dd>{formatAddress(user?.wallet_address)}</dd></div>
            <div><dt>Payment Note</dt><dd>{user?.payment_note}</dd></div>
            <div><dt>Watch Time</dt><dd>{formatSeconds(totalWatchedSeconds)}</dd></div>
            <div><dt>Total Spent</dt><dd>{formatAlgoFromMicro(totalSpentMicroalgos)}</dd></div>
          </dl>
        </article>
        <article className="panel glass-panel">
          <p className="eyebrow">Wallet</p>
          <h2>Payments & Balance</h2>
          <div className="profile-metrics">
            <div className="metric-card">
              <span>Current Balance</span>
              <strong>{formatAlgoFromMicro(balanceMicroalgos)}</strong>
            </div>
            <div className="metric-card">
              <span>Last Transaction</span>
              <strong>{latestTx?.action || "No transaction yet"}</strong>
            </div>
            <div className="metric-card">
              <span>Status</span>
              <strong>{walletMatchesUser ? "Wallet Ready" : "Wallet Pending"}</strong>
            </div>
          </div>
        </article>
        <article className="panel glass-panel">
          <p className="eyebrow">Subscription</p>
          <h2>Plan Details</h2>
          <div className="notes">
            <p>Plan: Premium Micropay OTT</p>
            <p>Billing Model: Prepaid balance deduction</p>
            <p>Rate: 0.00001 ALGO / second</p>
            <p>Access: All local clips and live wallet recharge</p>
          </div>
        </article>
        <article className="panel glass-panel">
          <p className="eyebrow">Streaming Stats</p>
          <h2>Usage Snapshot</h2>
          <div className="notes">
            <p>Platform Revenue: {formatAlgoFromMicro(globalStats?.total_spent_all_users || 0)}</p>
            <p>Total Claimed: {formatAlgoFromMicro(globalStats?.total_claimed || 0)}</p>
            <p>Remaining In System: {formatAlgoFromMicro(globalStats?.total_remaining || 0)}</p>
            <p>Users Active: {String(globalStats?.active_users || 0)}</p>
          </div>
        </article>
      </section>
    ),
  };

  if (!user) {
    const isCreatorPortal = portalMode === "creator";
    return (
      <main className="app-shell premium-shell auth-screen">
        <section className="hero-banner auth-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(4, 10, 24, 0.92) 10%, rgba(4, 10, 24, 0.68) 42%, rgba(4, 10, 24, 0.82) 100%), url(${selectedMovie.poster})` }}>
          <div className="hero-banner__content">
            <p className="eyebrow">Algorand Premium OTT</p>
            <div className="hero-meta">
              <span className="hero-chip">4K Atmos</span>
              <span className="hero-chip">Micropayments Live</span>
              <span className="hero-chip">Secure Wallet Flow</span>
            </div>
            <h1>{isCreatorPortal ? "Creator Claim Suite" : "Cinematic Streaming, Paid By The Second"}</h1>
            <p className="hero-copy">
              {isCreatorPortal
                ? "A private earnings console for the fixed receiver account. Review revenue, track claims, and reconcile payouts from the escrow layer."
                : "A premium OTT experience where viewers top up once, then watch local content with smooth live deduction, cinematic UI, and real Algorand-backed accounting."}
            </p>

            <div className="hero-actions">
              <button className={`button ${portalMode === "viewer" ? "primary" : "ghost"}`} onClick={() => setPortalMode("viewer")}>
                Viewer Portal
              </button>
              <button className={`button ${portalMode === "creator" ? "primary" : "ghost"}`} onClick={() => setPortalMode("creator")}>
                Creator Claim
              </button>
            </div>
          </div>
        </section>

        <section className="auth-layout">
          <article className="panel auth-panel glass-panel">
            <p className="eyebrow">{isCreatorPortal ? "Creator Access" : "Viewer Access"}</p>
            <h2>{isCreatorPortal ? "Receiver Login" : authMode === "signup" ? "Create User Account" : "User Login"}</h2>

            {isCreatorPortal ? (
              <form className="form-stack" onSubmit={handleLogin}>
                <label className="field">
                  <span>Email</span>
                  <input value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} />
                </label>
                <label className="field">
                  <span>Password</span>
                  <input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
                </label>
                <button type="submit" className="button primary" disabled={isSubmitting}>Login</button>
              </form>
            ) : authMode === "signup" ? (
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
                  <span>Wallet Address</span>
                  <input value={signupForm.wallet_address} onChange={(event) => setSignupForm({ ...signupForm, wallet_address: event.target.value })} />
                </label>
                <div className="hero-actions">
                  <button type="button" className="button secondary" onClick={connectWallet}>Connect Pera Wallet</button>
                  <button type="submit" className="button primary" disabled={isSubmitting}>Create Account</button>
                </div>
                <p className="auth-switch">
                  Already have an account?{" "}
                  <button type="button" className="text-button" onClick={() => setAuthMode("login")}>Login</button>
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
                <button type="submit" className="button primary" disabled={isSubmitting}>Login</button>
                <p className="auth-switch">
                  Don&apos;t have an account?{" "}
                  <button type="button" className="text-button" onClick={() => setAuthMode("signup")}>Sign Up</button>
                </p>
              </form>
            )}

            {(statusMessage || errorMessage) ? (
              <div className={`status-box ${errorMessage ? "status-error" : "status-success"}`}>
                <p>{errorMessage || statusMessage}</p>
              </div>
            ) : null}
          </article>

          <article className="panel auth-side glass-panel">
            <p className="eyebrow">{isCreatorPortal ? "Earnings Console" : "Playback Rules"}</p>
            <h2>{isCreatorPortal ? "Receiver Access" : "Recharge Then Watch"}</h2>
            <div className="feature-stack">
              {isCreatorPortal ? (
                <>
                  <div className="feature-card">
                    <strong>Manual Receiver Login</strong>
                    <span>No signup. The creator uses one fixed protected account.</span>
                  </div>
                  <div className="feature-card">
                    <strong>Claim Only</strong>
                    <span>The claim dashboard is isolated from all viewer playback features.</span>
                  </div>
                  <div className="feature-card">
                    <strong>Backend-Controlled Wallet</strong>
                    <span>The receiver address is controlled by the platform, not by frontend inputs.</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="feature-card">
                    <strong>Add Funds First</strong>
                    <span>Top up your OTT wallet through Pera before watching premium clips.</span>
                  </div>
                  <div className="feature-card">
                    <strong>Pay As You Watch</strong>
                    <span>Playback deducts 0.00001 ALGO per second from your in-app balance.</span>
                  </div>
                  <div className="feature-card">
                    <strong>Continuous Session</strong>
                    <span>Switching videos preserves the same total watch time and spend.</span>
                  </div>
                </>
              )}
            </div>
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell premium-shell dashboard-screen">
      <nav className="side-nav glass-panel">
        <div className="nav-brand">
          <span className="nav-logo">MS</span>
          <div>
            <strong>MicroStream</strong>
            <span>Premium OTT</span>
          </div>
        </div>
        <div className="nav-links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${currentPage === item.id ? "nav-item-active" : ""}`}
              type="button"
              onClick={() => setCurrentPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="main-shell">
        <section className="hero-banner" style={{ backgroundImage: `linear-gradient(90deg, rgba(6, 10, 20, 0.92) 8%, rgba(6, 10, 20, 0.6) 42%, rgba(6, 10, 20, 0.84) 100%), url(${selectedMovie.poster})` }}>
          <div className="hero-banner__content">
            <p className="eyebrow">{isViewer ? activeNavLabel : "Creator Console"}</p>
            <div className="hero-meta">
              <span className="hero-chip">{selectedMovie.lengthLabel}</span>
              <span className="hero-chip">{isViewer ? "Live Micropayments" : "Revenue Ledger"}</span>
              <span className="hero-chip">{isViewer ? (walletMatchesUser ? "Wallet Ready" : "Wallet Needed") : "Fixed Receiver"}</span>
            </div>
            <h1>{isViewer ? (currentPage === "profile" ? "Your OTT Profile" : currentPage === "watchlist" ? "Saved For Later" : currentPage === "explore" ? "Explore The Library" : selectedMovie.title) : "Receiver Claim Dashboard"}</h1>
            <p className="hero-copy">
              {isViewer
                ? (currentPage === "profile"
                  ? "A refined account space for balance, subscription details, watch metrics, and payment activity."
                  : currentPage === "watchlist"
                    ? "A curated personal shelf for titles you want to revisit, with the same premium playback experience."
                    : currentPage === "explore"
                      ? "Browse the full editorial library with cleaner discovery, genre filters, and elevated premium cards."
                      : `${selectedMovie.subtitle}. Premium prepaid viewing with real-time balance deduction, cinematic playback, and persistent watch-session tracking.`)
                : "A focused creator console for earnings, claim history, and platform revenue. No playback controls, only payout visibility and settlement."}
            </p>
            <div className="hero-actions">
              {isViewer ? <button className="button primary" onClick={() => (currentPage === "home" ? videoRef.current?.play() : setCurrentPage("home"))}>{currentPage === "home" ? "Watch Now" : "Go To Home"}</button> : null}
              {isViewer ? <button className="button secondary" onClick={() => toggleWatchlist(selectedMovie.id)}>{watchlistIds.includes(selectedMovie.id) ? "Remove From List" : "Add To List"}</button> : null}
              {isViewer ? <button className="button ghost" onClick={connectWallet}>{walletMatchesUser ? "Reconnect Wallet" : "Connect Wallet"}</button> : null}
              <button className="button ghost" onClick={() => loadDashboard()}>Refresh</button>
              <button className="button ghost" onClick={handleLogout}>Logout</button>
            </div>
          </div>
        </section>

        <section className="stats-grid ott-stats-grid">
          <article className="stat-card glass-panel"><span className="stat-label">Status</span><strong>{statusLabel}</strong></article>
          <article className="stat-card glass-panel"><span className="stat-label">{isViewer ? "Current Balance" : "Claimable"}</span><strong>{formatAlgoFromMicro(isViewer ? balanceMicroalgos : creatorSummary?.claimable_microalgos || 0)}</strong></article>
          <article className="stat-card glass-panel"><span className="stat-label">Total Spent</span><strong>{formatAlgoFromMicro(isViewer ? totalSpentMicroalgos : creatorSummary?.total_spent_microalgos || 0)}</strong></article>
          <article className="stat-card glass-panel"><span className="stat-label">{isViewer ? "Watch Time" : "Platform Revenue"}</span><strong>{isViewer ? formatSeconds(totalWatchedSeconds) : formatAlgoFromMicro(globalStats?.total_spent_all_users || 0)}</strong></article>
        </section>

        <section className="content-layout">
          <div className="content-main">
            {isViewer ? (
              <>
                {currentPage === "home" ? (
                  <>
                    <article className="panel movie-panel glass-panel">
                      <div className="panel-header">
                        <div>
                          <p className="eyebrow">Now Watching</p>
                          <h2>{selectedMovie.title}</h2>
                        </div>
                        {!walletMatchesUser ? <span className="role-badge">Connect Wallet to Watch</span> : null}
                      </div>

                      <VideoStage
                        videoRef={videoRef}
                        movie={selectedMovie}
                        onPlay={handleVideoPlay}
                        onPause={handleVideoPause}
                        onEnded={handleVideoEnded}
                      />

                      <div className="notes">
                        <p>Rate is fixed at 0.00001 ALGO per second.</p>
                        <p>Switching videos does not reset total watch time or total spent.</p>
                        {!walletMatchesUser ? <p>Connect the Pera wallet tied to your viewer account before pressing play.</p> : null}
                      </div>
                    </article>

                    {contentRows.map((row) => (
                      <article className="panel content-row-panel glass-panel" key={row.title}>
                        <div className="panel-header">
                          <div>
                            <p className="eyebrow">Content Row</p>
                            <h2>{row.title}</h2>
                          </div>
                          <span className="role-badge">{row.items.length} titles</span>
                        </div>

                        <div className="content-row-scroll">
                          {row.items.map((movie) => (
                            <button
                              key={`${row.title}-${movie.id}`}
                              type="button"
                              className={`movie-card ott-card ${movie.id === selectedMovieId ? "movie-card-active" : ""}`}
                              onClick={() => handleMovieSelect(movie.id)}
                              style={{ backgroundImage: `linear-gradient(180deg, rgba(4, 10, 18, 0.08), rgba(4, 10, 18, 0.92)), url(${movie.poster})` }}
                            >
                              <span className="movie-length">{movie.lengthLabel}</span>
                              <span className="play-overlay">Play</span>
                              <strong>{movie.title}</strong>
                              <span>{movie.subtitle}</span>
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}

                    <section className="panel-grid inner-panel-grid">
                      <article className="panel glass-panel">
                        <p className="eyebrow">Recent Ledger Activity</p>
                        <h2>Deposits And Viewing Usage</h2>
                        <div className="stream-list">
                          {transactions.length ? transactions.map((transaction) => (
                            <div className="stream-row" key={transaction._id || `${transaction.type}-${transaction.timestamp}`}>
                              <strong>{transaction.type}</strong>
                              <span>{formatAlgoFromMicro(transaction.amount)}</span>
                              <span>{transaction.movie_id || transaction.tx_hash || "ledger"}</span>
                              <span>{transaction.timestamp ? new Date(transaction.timestamp).toLocaleString() : "-"}</span>
                            </div>
                          )) : <p className="empty-state">No ledger activity yet.</p>}
                        </div>
                      </article>
                      <article className="panel glass-panel">
                        <p className="eyebrow">Platform Snapshot</p>
                        <h2>Global Revenue</h2>
                        <div className="notes">
                          <p>Platform Revenue: {formatAlgoFromMicro(globalStats?.total_spent_all_users || 0)}</p>
                          <p>Total Claimed: {formatAlgoFromMicro(globalStats?.total_claimed || 0)}</p>
                          <p>Remaining In System: {formatAlgoFromMicro(globalStats?.total_remaining || 0)}</p>
                          <p>Users Active: {String(globalStats?.active_users || 0)}</p>
                        </div>
                      </article>
                    </section>
                  </>
                ) : viewerPageContent[currentPage]}
              </>
            ) : (
              <article className="panel movie-panel glass-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Claim History</p>
                    <h2>Creator Overview</h2>
                  </div>
                  <span className="role-badge">Receiver</span>
                </div>
                <div className="stream-list">
                  {transactions.length ? transactions.map((transaction) => (
                    <div className="stream-row" key={transaction._id || `${transaction.type}-${transaction.timestamp}`}>
                      <strong>{transaction.type}</strong>
                      <span>{formatAlgoFromMicro(transaction.amount)}</span>
                      <span>{transaction.tx_hash || "ledger"}</span>
                      <span>{transaction.timestamp ? new Date(transaction.timestamp).toLocaleString() : "-"}</span>
                    </div>
                  )) : <p className="empty-state">No claim history yet.</p>}
                </div>

                <div className="notes">
                  <p>Total Platform Revenue: {formatAlgoFromMicro(globalStats?.total_spent_all_users || 0)}</p>
                  <p>Total Claimed So Far: {formatAlgoFromMicro(globalStats?.total_claimed || 0)}</p>
                  <p>Remaining In Escrow: {formatAlgoFromMicro(globalStats?.total_remaining || 0)}</p>
                  <p>Active Viewer Accounts: {String(globalStats?.active_users || 0)}</p>
                </div>
              </article>
            )}
          </div>

          <aside className="content-side">
            <article className="panel side-card glass-panel profile-card">
              <p className="eyebrow">{isViewer ? "Profile" : "Claim Panel"}</p>
              <h2>{isViewer ? "Premium Account" : "Claim Earnings"}</h2>
              <dl className="details-list">
                <div><dt>Name</dt><dd>{user.name}</dd></div>
                <div><dt>Email</dt><dd>{user.email}</dd></div>
                <div><dt>Stored Wallet</dt><dd>{user.wallet_address}</dd></div>
                <div><dt>Receiver</dt><dd>{RECEIVER_ACCOUNT.wallet_address}</dd></div>
                <div><dt>Escrow</dt><dd>{creatorSummary?.escrow_wallet_address || "Contract escrow"}</dd></div>
                {isViewer ? <div><dt>Payment Note</dt><dd>{user.payment_note}</dd></div> : null}
                <div><dt>Last TX</dt><dd>{latestTx ? `${latestTx.action}: ${latestTx.txId}` : "No transaction yet"}</dd></div>
                {!isViewer ? <div><dt>Total Claimed</dt><dd>{formatAlgoFromMicro(creatorSummary?.total_claimed_microalgos || 0)}</dd></div> : null}
                {!isViewer ? <div><dt>Remaining Balance</dt><dd>{formatAlgoFromMicro(creatorSummary?.claimable_microalgos || 0)}</dd></div> : null}
                {!isViewer ? <div><dt>Platform Revenue</dt><dd>{formatAlgoFromMicro(globalStats?.total_spent_all_users || 0)}</dd></div> : null}
                {!isViewer ? <div><dt>Users Active</dt><dd>{String(globalStats?.active_users || 0)}</dd></div> : null}
              </dl>
            </article>

            <article className="panel side-card glass-panel">
              <p className="eyebrow">{isViewer ? "Wallet Recharge" : "Settlement"}</p>
              <h2>{isViewer ? "Add Funds To Watch" : "Claim Earnings"}</h2>

              {isViewer ? (
                <>
                  <label className="field">
                    <span>Deposit (ALGO)</span>
                    <input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
                  </label>
                  <div className="notes">
                    <p>Recommended: send through Pera Wallet. The app sends your deposit to the contract escrow and adds your unique payment note automatically.</p>
                    <p>Backup demo method: send manually to the escrow address with note `{user.payment_note}` and then verify the tx id here.</p>
                  </div>
                  <label className="field">
                    <span>Manual Deposit Tx ID</span>
                    <input value={manualDepositTxId} onChange={(event) => setManualDepositTxId(event.target.value)} placeholder="Paste confirmed Algorand tx id" />
                  </label>
                  <div className="action-grid">
                    <button className="button primary" disabled={isSubmitting} onClick={addFunds}>Add Funds</button>
                    <button className="button secondary" disabled={isSubmitting} onClick={verifyManualDeposit}>Verify Deposit</button>
                    <button className="button secondary" disabled={isSubmitting || !walletMatchesUser} onClick={connectWallet}>Reconnect Wallet</button>
                    <button className="button danger" disabled={isSubmitting || playbackState === "stopped"} onClick={handleManualStop}>Stop</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="action-grid">
                    <button
                      className="button primary"
                      disabled={isSubmitting || !(creatorSummary?.claimable_microalgos >= MIN_RECEIVER_CLAIM_MICROALGOS)}
                      onClick={claimCreatorEarnings}
                    >
                      Claim Earnings
                    </button>
                  </div>
                  <div className="notes">
                    <p>Claim only when earnings are above about 0.002 ALGO. Smaller claims can be swallowed by Algorand network fees.</p>
                  </div>
                </>
              )}

              {(claimResult || statusMessage || errorMessage) ? (
                <div className={`status-box ${errorMessage ? "status-error" : "status-success"}`}>
                  <p>{errorMessage || claimResult || statusMessage}</p>
                </div>
              ) : null}
            </article>

            <article className="panel side-card glass-panel">
              <p className="eyebrow">{isViewer ? "Watchlist Preview" : "Revenue Snapshot"}</p>
              <h2>{isViewer ? "Your Queue" : "Platform Snapshot"}</h2>
              <div className="mini-list">
                {(isViewer ? MOVIES.slice(0, 3) : highlightedRow.items.slice(0, 3)).map((item) => (
                  <button key={`mini-${item.id}`} type="button" className="mini-item" onClick={() => isViewer && handleMovieSelect(item.id)}>
                    <img src={item.poster} alt={item.title} />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.subtitle}</span>
                    </div>
                  </button>
                ))}
              </div>
            </article>
          </aside>
        </section>

        <nav className="bottom-nav glass-panel">
          {NAV_ITEMS.map((item) => (
            <button
              key={`mobile-${item.id}`}
              className={`nav-item ${currentPage === item.id ? "nav-item-active" : ""}`}
              type="button"
              onClick={() => setCurrentPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </main>
  );
}

export default App;
