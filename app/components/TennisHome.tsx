"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

type AuthMode = "login" | "register";

type StoredUser = {
  id: string;
  email: string;
  name: string;
  ntrpLevel?: number;
};

type ApiResponse = {
  message?: string;
  error?: string;
  user?: {
    id: string;
    email?: string;
    profile?: {
      nickname?: string | null;
      ntrp_level?: number | null;
    } | null;
  };
};

type Court = {
  id: string;
  name: string;
  city: string;
  district: string | null;
  address: string | null;
  surface: string | null;
};

type CourtsResponse = {
  courts?: Court[];
  message?: string;
  error?: string;
};

type MatchResponse = {
  message?: string;
  error?: string;
};

type MatchSummary = {
  id: string;
  playTime: string;
  feePerPerson: number;
  status: string;
  court: {
    id: string;
    name: string;
    city: string;
    district: string | null;
  } | null;
  host: {
    id: string;
    nickname: string;
  };
};

type MatchesResponse = {
  matches?: MatchSummary[];
  message?: string;
  error?: string;
};

const STORAGE_KEY = "tennis-taiwan-user";

const municipalities = [
  {
    city: "台北",
    districts: [
      "中正區",
      "大同區",
      "中山區",
      "松山區",
      "大安區",
      "萬華區",
      "信義區",
      "士林區",
      "北投區",
      "內湖區",
      "南港區",
      "文山區",
    ],
  },
  {
    city: "新北",
    districts: [
      "板橋區",
      "三重區",
      "中和區",
      "永和區",
      "新莊區",
      "新店區",
      "樹林區",
      "鶯歌區",
      "三峽區",
      "淡水區",
      "汐止區",
      "瑞芳區",
      "土城區",
      "蘆洲區",
      "五股區",
      "泰山區",
      "林口區",
      "深坑區",
      "石碇區",
      "坪林區",
      "三芝區",
      "石門區",
      "八里區",
      "平溪區",
      "雙溪區",
      "貢寮區",
      "金山區",
      "萬里區",
      "烏來區",
    ],
  },
  {
    city: "桃園",
    districts: [
      "桃園區",
      "中壢區",
      "平鎮區",
      "八德區",
      "楊梅區",
      "蘆竹區",
      "大溪區",
      "龍潭區",
      "龜山區",
      "大園區",
      "觀音區",
      "新屋區",
      "復興區",
    ],
  },
  {
    city: "台中",
    districts: [
      "中區",
      "東區",
      "南區",
      "西區",
      "北區",
      "北屯區",
      "西屯區",
      "南屯區",
      "太平區",
      "大里區",
      "霧峰區",
      "烏日區",
      "豐原區",
      "后里區",
      "石岡區",
      "東勢區",
      "和平區",
      "新社區",
      "潭子區",
      "大雅區",
      "神岡區",
      "大肚區",
      "沙鹿區",
      "龍井區",
      "梧棲區",
      "清水區",
      "大甲區",
      "外埔區",
      "大安區",
    ],
  },
  {
    city: "台南",
    districts: [
      "中西區",
      "東區",
      "南區",
      "北區",
      "安平區",
      "安南區",
      "永康區",
      "歸仁區",
      "新化區",
      "左鎮區",
      "玉井區",
      "楠西區",
      "南化區",
      "仁德區",
      "關廟區",
      "龍崎區",
      "官田區",
      "麻豆區",
      "佳里區",
      "西港區",
      "七股區",
      "將軍區",
      "學甲區",
      "北門區",
      "新營區",
      "後壁區",
      "白河區",
      "東山區",
      "六甲區",
      "下營區",
      "柳營區",
      "鹽水區",
      "善化區",
      "大內區",
      "山上區",
      "新市區",
      "安定區",
    ],
  },
  {
    city: "高雄",
    districts: [
      "新興區",
      "前金區",
      "苓雅區",
      "鹽埕區",
      "鼓山區",
      "旗津區",
      "前鎮區",
      "三民區",
      "楠梓區",
      "小港區",
      "左營區",
      "仁武區",
      "大社區",
      "岡山區",
      "路竹區",
      "阿蓮區",
      "田寮區",
      "燕巢區",
      "橋頭區",
      "梓官區",
      "彌陀區",
      "永安區",
      "湖內區",
      "鳳山區",
      "大寮區",
      "林園區",
      "鳥松區",
      "大樹區",
      "旗山區",
      "美濃區",
      "六龜區",
      "內門區",
      "杉林區",
      "甲仙區",
      "桃源區",
      "那瑪夏區",
      "茂林區",
      "茄萣區",
    ],
  },
] as const;

function parseStoredUser(snapshot: string): StoredUser | null {
  try {
    return snapshot ? (JSON.parse(snapshot) as StoredUser) : null;
  } catch {
    return null;
  }
}

function getAuthSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

function subscribeToAuthStore(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener("tennis-auth-change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("tennis-auth-change", onStoreChange);
  };
}

function emitAuthChange() {
  window.dispatchEvent(new Event("tennis-auth-change"));
}

export default function TennisHome() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [ntrpLevel, setNtrpLevel] = useState("3.0");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsStatus, setCourtsStatus] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [fee, setFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [createStatus, setCreateStatus] = useState("");
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [openMatches, setOpenMatches] = useState<MatchSummary[]>([]);
  const [matchesStatus, setMatchesStatus] = useState("正在載入球局...");
  const [selectedMatchCity, setSelectedMatchCity] = useState("");
  const [selectedMatchDistrict, setSelectedMatchDistrict] = useState("");
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthStore,
    getAuthSnapshot,
    () => ""
  );

  const currentUser = useMemo(
    () => parseStoredUser(authSnapshot),
    [authSnapshot]
  );

  const dialogTitle = authMode === "register" ? "建立帳號" : "登入帳號";
  const primaryText = authMode === "register" ? "送出註冊" : "登入";

  const userInitial = useMemo(() => {
    const source = currentUser?.name || currentUser?.email || "T";
    return source.slice(0, 1).toUpperCase();
  }, [currentUser]);

  const districtOptions = useMemo(() => {
    if (!selectedCity) return [];

    return (
      municipalities.find((municipality) => municipality.city === selectedCity)
        ?.districts ?? []
    );
  }, [selectedCity]);

  const matchDistrictOptions = useMemo(() => {
    if (!selectedMatchCity) return [];

    return (
      municipalities.find(
        (municipality) => municipality.city === selectedMatchCity
      )?.districts ?? []
    );
  }, [selectedMatchCity]);

  const selectedCourt = useMemo(
    () => courts.find((court) => court.id === selectedCourtId),
    [courts, selectedCourtId]
  );

  const courtPlaceholder = useMemo(() => {
    if (!selectedCity) return "請先選擇城市";
    if (courtsStatus) return courtsStatus;
    return "選擇球場";
  }, [courtsStatus, selectedCity]);

  useEffect(() => {
    if (!selectedCity) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ city: selectedCity });

    if (selectedDistrict) {
      params.set("district", selectedDistrict);
    }

    async function loadCourts() {
      try {
        const response = await fetch(`/api/courts?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as CourtsResponse;

        if (!response.ok) {
          setCourtsStatus(data.message ?? data.error ?? "讀取球場資料失敗。");
          return;
        }

        const nextCourts = data.courts ?? [];
        setCourts(nextCourts);
        setCourtsStatus(nextCourts.length > 0 ? "" : "這個條件目前沒有球場。");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCourtsStatus("無法讀取球場資料，請稍後再試。");
      }
    }

    loadCourts();

    return () => {
      controller.abort();
    };
  }, [selectedCity, selectedDistrict]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();

    if (selectedMatchCity) {
      params.set("city", selectedMatchCity);
    }

    if (selectedMatchDistrict) {
      params.set("district", selectedMatchDistrict);
    }

    async function loadMatches() {
      try {
        const queryString = params.toString();
        const response = await fetch(
          queryString ? `/api/matches?${queryString}` : "/api/matches",
          { signal: controller.signal }
        );
        const data = (await response.json()) as MatchesResponse;

        if (!response.ok) {
          setMatchesStatus(data.message ?? data.error ?? "讀取球局資料失敗。");
          return;
        }

        const nextMatches = data.matches ?? [];
        setOpenMatches(nextMatches);
        setMatchesStatus(nextMatches.length > 0 ? "" : "目前沒有符合條件的球局。");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setMatchesStatus("無法讀取球局資料，請稍後再試。");
      }
    }

    loadMatches();

    return () => {
      controller.abort();
    };
  }, [selectedMatchCity, selectedMatchDistrict, matchesRefreshKey]);

  function resetForm(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setStatusMessage("");
    setPassword("");
    if (nextMode === "register" && currentUser?.email) {
      setEmail(currentUser.email);
    }
  }

  function closeDialog() {
    setAuthMode(null);
    setStatusMessage("");
    setIsSubmitting(false);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authMode) return;

    setIsSubmitting(true);
    setStatusMessage("");

    const endpoint =
      authMode === "register" ? "/api/user/register" : "/api/user/login";
    const body =
      authMode === "register"
        ? {
            email,
            password,
            nickname,
            ntrp_level: Number(ntrpLevel),
          }
        : {
            email,
            password,
          };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setStatusMessage(data.message ?? data.error ?? "操作失敗，請稍後再試。");
        return;
      }

      if (authMode === "login" && data.user) {
        const nextUser: StoredUser = {
          id: data.user.id,
          email: data.user.email ?? email,
          name: data.user.profile?.nickname ?? data.user.email ?? email,
          ntrpLevel: data.user.profile?.ntrp_level ?? undefined,
        };

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
        emitAuthChange();
        closeDialog();
        return;
      }

      setStatusMessage(
        data.message ?? "註冊信已寄出，請完成 Email 驗證後再登入。"
      );
      setAuthMode("login");
      setPassword("");
    } catch {
      setStatusMessage("網路連線異常，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/user/logout", {
        method: "POST",
      });
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
      emitAuthChange();
      setEmail("");
      setPassword("");
      setNickname("");
      setStatusMessage("");
      setAuthMode(null);
    }
  }

  function handleCitySelect(city: string) {
    setSelectedCity(city);
    setSelectedDistrict("");
    setSelectedCourtId("");
    setCourts([]);
    setCourtsStatus("正在載入球場...");
    setCreateStatus("");
  }

  function handleMatchCitySelect(city: string) {
    const nextCity = selectedMatchCity === city ? "" : city;

    setSelectedMatchCity(nextCity);
    setSelectedMatchDistrict("");
    setOpenMatches([]);
    setMatchesStatus("正在載入球局...");
  }

  function handleMatchDistrictSelect(district: string) {
    setSelectedMatchDistrict(district);
    setOpenMatches([]);
    setMatchesStatus("正在載入球局...");
  }

  function formatMatchTime(value: string) {
    return new Intl.DateTimeFormat("zh-Hant-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  }

  function formatFee(value: number) {
    return value > 0 ? `NT$${Math.round(value)}` : "免費";
  }

  async function handleCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStatus("");

    if (!currentUser) {
      resetForm("login");
      setCreateStatus("請先登入後再建立球局。");
      return;
    }

    if (!selectedCity || !selectedCourtId || !matchTime) {
      setCreateStatus("請選擇城市、球場和時間。");
      return;
    }

    setIsCreatingMatch(true);

    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: currentUser.id,
          courtId: selectedCourtId,
          matchTime,
          maxPlayers: Number(maxPlayers),
          fee: Number(fee || 0),
          notes,
        }),
      });
      const data = (await response.json()) as MatchResponse;

      if (!response.ok) {
        setCreateStatus(data.message ?? data.error ?? "建立球局失敗。");
        return;
      }

      setCreateStatus(data.message ?? "約球建立成功。");
      setSelectedCourtId("");
      setMatchTime("");
      setFee("0");
      setNotes("");
      setMatchesRefreshKey((current) => current + 1);
    } catch {
      setCreateStatus("網路連線異常，請稍後再試。");
    } finally {
      setIsCreatingMatch(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Taiwan Tennis Match">
          <span className="brand-mark">T</span>
          <span>
            <strong>Tennis Taiwan</strong>
            <small>約球平台</small>
          </span>
        </Link>

        <nav className="auth-actions" aria-label="會員功能">
          {currentUser ? (
            <>
              <span className="user-pill">
                <span className="avatar" aria-hidden="true">
                  {userInitial}
                </span>
                <span>{currentUser.name}</span>
              </span>
              <button className="ghost-button" type="button" onClick={handleLogout}>
                登出
              </button>
            </>
          ) : (
            <>
              <button
                className="ghost-button"
                type="button"
                onClick={() => resetForm("register")}
              >
                註冊
              </button>
              <button
                className="solid-button"
                type="button"
                onClick={() => resetForm("login")}
              >
                登入
              </button>
            </>
          )}
        </nav>
      </header>

      <section className="overview">
        <div className="intro">
          <p className="eyebrow">Taiwan tennis finder</p>
          <h1>今天想打球，就從一場剛好的約球開始。</h1>
          <p className="lead">
            依城市、程度、時間快速找到球友。登入後即可建立自己的球局，讓臨時手癢變成穩定上場。
          </p>
          <div className="quick-stats" aria-label="平台摘要">
            <span>
              <strong>18</strong>
              <small>開放球局</small>
            </span>
            <span>
              <strong>6</strong>
              <small>熱門球場</small>
            </span>
            <span>
              <strong>3.5</strong>
              <small>平均 NTRP</small>
            </span>
          </div>
        </div>

        <div className="court-visual" aria-label="網球場視覺">
          <div className="court-frame">
            <div className="court-line court-line-vertical" />
            <div className="court-line court-line-horizontal" />
            <div className="court-service court-service-left" />
            <div className="court-service court-service-right" />
            <span className="player-dot player-one" />
            <span className="player-dot player-two" />
            <span className="ball-dot" />
          </div>
        </div>
      </section>

      <section className="workspace" aria-label="約球工作區">
        <div className="content-grid">
          <section className="match-column" aria-labelledby="matches-title">
            <div className="column-heading">
              <p className="eyebrow">Open matches</p>
              <h2 id="matches-title">近期球局</h2>
            </div>

            <div className="match-list">
              <div className="match-filter-panel" aria-label="篩選近期球局">
                <div className="city-field">
                  <div
                    className="city-toggle match-city-toggle"
                    aria-label="選擇球局城市"
                  >
                    {municipalities.map(({ city }) => (
                      <button
                        aria-pressed={selectedMatchCity === city}
                        className={`filter-chip ${
                          selectedMatchCity === city ? "active" : ""
                        }`}
                        key={city}
                        onClick={() => handleMatchCitySelect(city)}
                        type="button"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="match-district-field">
                  行政區
                  <select
                    disabled={!selectedMatchCity}
                    onChange={(event) =>
                      handleMatchDistrictSelect(event.target.value)
                    }
                    value={selectedMatchDistrict}
                  >
                    <option value="">不限行政區</option>
                    {matchDistrictOptions.map((district) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {matchesStatus ? (
                <div className="empty-state" role="status">
                  {matchesStatus}
                </div>
              ) : null}

              {openMatches.map((match) => (
                <article className="match-card" key={match.id}>
                  <div>
                    <p className="match-time">
                      {formatMatchTime(match.playTime)}
                    </p>
                    <h3>{match.court?.name ?? "未知球場"}</h3>
                    <p>創建者：{match.host.nickname}</p>
                  </div>
                  <div className="match-meta">
                    <span>{formatFee(match.feePerPerson)} / 人</span>
                  </div>
                  <button className="join-button" type="button">
                    加入
                  </button>
                </article>
              ))}
            </div>
          </section>

          <aside className="create-column" aria-labelledby="create-title">
            <div className="column-heading">
              <p className="eyebrow">Create</p>
              <h2 id="create-title">發起新球局</h2>
            </div>
            <div className="create-panel">
              <div className="city-field">
                <span className="field-caption">選擇城市</span>
                <div className="city-toggle" aria-label="選擇城市">
                  {municipalities.map(({ city }) => (
                    <button
                      className={`filter-chip ${
                        selectedCity === city ? "active" : ""
                      }`}
                      key={city}
                      onClick={() => handleCitySelect(city)}
                      type="button"
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
              <form className="compact-form" onSubmit={handleCreateMatch}>
              <label>
                行政區
                <select
                  disabled={!selectedCity || districtOptions.length === 0}
                  onChange={(event) => {
                    setSelectedDistrict(event.target.value);
                    setSelectedCourtId("");
                    setCourts([]);
                    setCourtsStatus("正在載入球場...");
                    setCreateStatus("");
                  }}
                  value={selectedDistrict}
                >
                  <option value="">不限行政區</option>
                  {districtOptions.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                球場
                <select
                  disabled={!selectedCity}
                  onChange={(event) => {
                    setSelectedCourtId(event.target.value);
                    setCreateStatus("");
                  }}
                  required
                  value={selectedCourtId}
                >
                  <option value="">{courtPlaceholder}</option>
                  {courts.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                      {court.district ? `｜${court.district}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              {selectedCourt ? (
                <div className="court-detail">
                  <strong>{selectedCourt.name}</strong>
                  <span>{selectedCourt.address ?? "尚未提供地址"}</span>
                  <small>
                    {selectedCourt.city}
                    {selectedCourt.district ? ` / ${selectedCourt.district}` : ""}
                    {selectedCourt.surface ? ` / ${selectedCourt.surface}` : ""}
                  </small>
                </div>
              ) : null}

              <label>
                時間
                <input
                  onChange={(event) => setMatchTime(event.target.value)}
                  required
                  type="datetime-local"
                  value={matchTime}
                />
              </label>
              <label>
                人數
                <select
                  onChange={(event) => setMaxPlayers(event.target.value)}
                  value={maxPlayers}
                >
                  <option value="2">2 人</option>
                  <option value="3">3 人</option>
                  <option value="4">4 人</option>
                </select>
              </label>

              <label>
                每人費用
                <input
                  min="0"
                  onChange={(event) => setFee(event.target.value)}
                  step="1"
                  type="number"
                  value={fee}
                />
              </label>

              <label>
                備註
                <textarea
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="例：雙打、程度 3.0 以上、歡迎新朋友"
                  rows={3}
                  value={notes}
                />
              </label>

              {courtsStatus || createStatus ? (
                <p className="form-message" role="status">
                  {createStatus || courtsStatus}
                </p>
              ) : null}

              <button
                className="solid-button full-width"
                disabled={isCreatingMatch || Boolean(courtsStatus)}
              >
                {isCreatingMatch
                  ? "建立中..."
                  : currentUser
                    ? "建立球局"
                    : "登入後建立"}
              </button>
              </form>
            </div>
          </aside>
        </div>
      </section>

      {authMode ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="auth-title"
            aria-modal="true"
            className="auth-dialog"
            role="dialog"
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">Member</p>
                <h2 id="auth-title">{dialogTitle}</h2>
              </div>
              <button
                aria-label="關閉"
                className="icon-button"
                type="button"
                onClick={closeDialog}
              >
                ×
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>
                Email
                <input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label>
                密碼
                <input
                  autoComplete={
                    authMode === "register" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>

              {authMode === "register" ? (
                <>
                  <label>
                    暱稱
                    <input
                      autoComplete="nickname"
                      minLength={2}
                      onChange={(event) => setNickname(event.target.value)}
                      required
                      value={nickname}
                    />
                  </label>

                  <label>
                    NTRP 程度
                    <select
                      onChange={(event) => setNtrpLevel(event.target.value)}
                      required
                      value={ntrpLevel}
                    >
                      {["1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5", "6.0", "6.5", "7.0"].map(
                        (level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </>
              ) : null}

              {statusMessage ? (
                <p className="form-message" role="status">
                  {statusMessage}
                </p>
              ) : null}

              <button className="solid-button full-width" disabled={isSubmitting}>
                {isSubmitting ? "處理中..." : primaryText}
              </button>
            </form>

            <button
              className="text-button"
              type="button"
              onClick={() =>
                setAuthMode(authMode === "register" ? "login" : "register")
              }
            >
              {authMode === "register" ? "已有帳號，改用登入" : "還沒有帳號，前往註冊"}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
