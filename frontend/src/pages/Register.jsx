import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import {
  CircleAlert,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Phone,
  User,
  Wallet,
} from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/hooks/useAuth";
import {
  getAuthErrorMessage,
  validatePhone,
  validatePin,
} from "@/lib/authValidation";

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const register = useRegister();

  const from = location.state?.from?.pathname || "/dashboard";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    phone: "",
    pin: "",
    confirmPin: "",
  });
  const [serverError, setServerError] = useState("");

  const isSubmitting = register.isPending;

  const handleSubmit = (e) => {
    e.preventDefault();

    const next = {
      name: name.trim() ? "" : "Full name is required.",
      phone: validatePhone(phone),
      pin: validatePin(pin),
      confirmPin: "",
    };
    if (!confirmPin) {
      next.confirmPin = "Please confirm your PIN.";
    } else if (confirmPin.trim() !== pin.trim()) {
      next.confirmPin = "PINs do not match.";
    }
    setFieldErrors(next);
    setServerError("");

    if (next.name || next.phone || next.pin || next.confirmPin) return;

    register.mutate(
      { name: name.trim(), phone: phone.trim(), pin: pin.trim() },
      {
        onSuccess: () => {
          setPin("");
          setConfirmPin("");
          navigate(from, { replace: true });
        },
        onError: (err) => {
          setPin("");
          setConfirmPin("");
          setServerError(
            getAuthErrorMessage(
              err,
              "Could not create your account. Please try again."
            )
          );
        },
      }
    );
  };

  return (
    <AuthShell
      title="Create your account"
      subtitle="Sign up with your name, Bangladeshi mobile number, and a 6-digit PIN."
      footer={
        <p className="text-center text-sm text-[#3d4f63]">
          Already have an account?{" "}
          <Link
            to="/login"
            state={location.state}
            className="font-semibold text-[#0756A6] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6]"
          >
            Log in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {serverError ? (
          <Alert variant="destructive" role="alert">
            <CircleAlert aria-hidden="true" />
            <AlertTitle>Couldn&apos;t create your account</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-name">Full name</Label>
          <div className="relative">
            <User
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="register-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your full name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldErrors((p) => ({ ...p, name: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "register-name-error" : undefined}
              className="h-11 pl-9"
              disabled={isSubmitting}
              required
            />
          </div>
          {fieldErrors.name ? (
            <p id="register-name-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-phone">Mobile number</Label>
          <div className="relative">
            <Phone
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="register-phone"
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
                fieldErrors.phone ? "register-phone-error" : "register-phone-hint"
              }
              className="h-11 pl-9"
              disabled={isSubmitting}
              required
            />
          </div>
          {fieldErrors.phone ? (
            <p id="register-phone-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.phone}
            </p>
          ) : (
            <p id="register-phone-hint" className="text-xs text-muted-foreground">
              Bangladeshi mobile format: 01XXXXXXXXX
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-pin">6-digit PIN</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="register-pin"
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="••••••"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                setFieldErrors((p) => ({ ...p, pin: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.pin)}
              aria-describedby={fieldErrors.pin ? "register-pin-error" : undefined}
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
            <p id="register-pin-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.pin}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="register-confirm">Confirm PIN</Label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="register-confirm"
              name="confirmPin"
              type={showConfirm ? "text" : "password"}
              inputMode="numeric"
              autoComplete="new-password"
              placeholder="••••••"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => {
                setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6));
                setFieldErrors((p) => ({ ...p, confirmPin: "" }));
              }}
              aria-invalid={Boolean(fieldErrors.confirmPin)}
              aria-describedby={
                fieldErrors.confirmPin ? "register-confirm-error" : undefined
              }
              className="h-11 pr-11 pl-9"
              disabled={isSubmitting}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide PIN confirmation" : "Show PIN confirmation"}
              aria-pressed={showConfirm}
              disabled={isSubmitting}
              className="absolute top-1/2 right-2.5 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0756A6] disabled:opacity-50"
            >
              {showConfirm ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
          {fieldErrors.confirmPin ? (
            <p id="register-confirm-error" role="alert" className="text-xs text-destructive">
              {fieldErrors.confirmPin}
            </p>
          ) : null}
        </div>

        <p className="flex items-start gap-2 rounded-xl bg-[#EAF3FC] p-3 text-xs leading-relaxed text-[#064581]">
          <Wallet className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          A personal wallet is created automatically for every new account, so
          you can start tracking right away.
        </p>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="h-11 w-full bg-[#0756A6] text-sm font-bold text-white hover:bg-[#064581]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Creating account…
            </>
          ) : (
            "Create free account"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
