import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Footer from "../components/FooterSlim";
import noBgLogo from "../../mafdesh-img/noBackground-logo.png";
import {
  ensureCurrentUserContext,
  resolveAuthCallbackSession,
} from "../services/authSessionService";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing secure sign-in...");

  useEffect(() => {
    let isMounted = true;

    const finalizeAuth = async () => {
      const result = await resolveAuthCallbackSession();

      if (!isMounted) {
        return;
      }

      if (result.status === "error") {
        navigate("/login", {
          replace: true,
          state: {
            message:
              result.flow === "recovery"
                ? "This password reset link is invalid or has expired. Please request a new one."
                : "This verification link is invalid or has expired. Please request a new one.",
          },
        });
        return;
      }

      if (result.flow === "recovery") {
        if (!result.session?.user) {
          navigate("/login", {
            replace: true,
            state: {
              message: "This password reset link is invalid or has expired. Please request a new one.",
            },
          });
          return;
        }

        navigate("/reset-password", {
          replace: true,
          state: {
            recoveryReady: true,
          },
        });
        return;
      }

      if (result.session?.user) {
        try {
          await ensureCurrentUserContext({
            authUser: result.session.user,
          });
        } catch (error) {
          console.error("Auth callback bootstrap recovery failed:", error);
        }

        navigate("/email-verified", { replace: true });
        return;
      }

      setMessage("Redirecting you to login...");
      navigate("/login", {
        replace: true,
        state: {
          message: "Your email has been verified. Please log in to continue.",
        },
      });
    };

    finalizeAuth().catch((error) => {
      console.error("Auth callback failed:", error);
      if (isMounted) {
        navigate("/login", {
          replace: true,
          state: {
            message: "We could not complete that authentication step. Please try again.",
          },
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md text-center">
          <img
            src={noBgLogo}
            alt="Mafdesh Logo"
            className="w-auto mx-auto"
            style={{ height: "120px" }}
          />
          <div className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-8">
            <p className="text-base font-semibold text-blue-900">{message}</p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
