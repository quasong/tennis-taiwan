import Link from "next/link";
import type { StoredUser } from "./types";

type HeaderProps = {
  currentUser: StoredUser | null;
  onLogin: () => void;
  onLogout: () => void;
  onRegister: () => void;
};

export function Header({
  currentUser,
  onLogin,
  onLogout,
  onRegister,
}: HeaderProps) {
  const userInitial = (currentUser?.name || currentUser?.email || "T")
    .slice(0, 1)
    .toUpperCase();

  return (
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
            <button className="ghost-button" type="button" onClick={onLogout}>
              登出
            </button>
          </>
        ) : (
          <>
            <button className="ghost-button" type="button" onClick={onRegister}>
              註冊
            </button>
            <button className="solid-button" type="button" onClick={onLogin}>
              登入
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
