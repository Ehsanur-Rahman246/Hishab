import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { CircleAlert, Eye, EyeOff, Loader2, Lock, Phone } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/useAuth";
import {
  getAuthErrorMessage,
  validatePhone,
  validatePin,
} from "@/lib/authValidation";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const from = location.state?.from?.pathname || "/dashboard";

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ phone: "", pin: "" });
  const [serverError, setServerError] = useState("");

  const isSubmitting = login.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();

    const phoneError = validatePhone(phone);
    const pinError = validatePin(pin);
    setFieldErrors({ phone: phoneError, pin: pinError });
    setServerError("");

    if (phoneError || pinError) return;

    login.mutate(
      { phone: phone.trim(), pin: pin.trim() },
      {
        onSuccess: () => {
          setPin("");
          navigate(from, { replace: true });
        },
        onError: (err) => {
          setPin("");
          setServerError(
            getAuthErrorMessage(err, "Invalid phone or PIN. Please try again.")
          );
        },
      }
    );
  };

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in with your mobile number and 6-digit PIN to reach your AI financial coach."
      footer={
        <p className="text-center text-sm text-[#3d4f63]">
          New to Hishab?{" "}
          <Link
            to="/register"
            state={location.state}
            className="font-semibold text-[#0756A6] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
          >
            Create a free account
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {serverError ? (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Couldn&apos;t log you in</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="login-phone">Mobile number</Label>
          <div className="relative">
            <Phone
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="login-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="01XXXXXXXXX"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setFieldErrors((p) => ({ ...p, phone: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={
                fieldErrors.phone ? "login-phone-error" : undefined
              }
              className="h-11 pl-9"
              disabled={isSubmitting}
              required
            />
          </div>
          {fieldErrors.phone ? (
            <p id="login-phone-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.phone}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Bangladeshi mobile format: 01XXXXXXXXX
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="login-pin">6-digit PIN</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="login-pin"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="••••••"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                setFieldErrors((p) => ({ ...p, pin: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.pin)}
              aria-describedby={fieldErrors.pin ? "login-pin-error" : undefined}
              className="h-11 pr-11 pl-9"
              disabled={isSubmitting}
              required
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              aria-label={showPin ? "Hide PIN" : "Show PIN"}
              aria-pressed={showPin}
              disabled={isSubmitting}
              className="absolute top-1/2 right-2.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6] disabled:opacity-50"
            >
              {showPin ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {fieldErrors.pin ? (
            <p id="login-pin-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.pin}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="h-11 w-full bg-[#0756A6] text-sm font-bold text-white hover:bg-[#064581]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Logging in…
            </>
          ) : (
            "Log in"
          )}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          Never share your PIN with anyone.
        </p>
      </form>
    </AuthShell>
  );
}
