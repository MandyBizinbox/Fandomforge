import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthCallback() {
  const { exchangeGoogleSession } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const sessionId = params.get("session_id");
      if (!sessionId) {
        navigate("/login?error=missing_session");
        return;
      }
      try {
        const user = await exchangeGoogleSession(sessionId);
        window.history.replaceState(null, "", "/");
        if (user.role === "super_admin") navigate("/admin");
        else if (user.role === "creator") navigate("/creator");
        else if (user.role === "printer") navigate("/printer");
        else navigate("/");
      } catch (e) {
        navigate("/login?error=exchange_failed");
      }
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen page-shell flex items-center justify-center">
      <div className="text-center">
        <div className="overline mb-4">Securing session</div>
        <div className="font-display text-4xl uppercase">One moment…</div>
      </div>
    </div>
  );
}
