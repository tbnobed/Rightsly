import { useState } from "react";
import { Link } from "wouter";
import { useAcceptInvitation } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AcceptInvite() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const acceptInvitation = useAcceptInvitation();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!token) {
      setError("This invitation link is invalid.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    try {
      const response = await acceptInvitation.mutateAsync({ data: { token, password } });
      localStorage.setItem("auth_token", response.token);
      window.location.assign(import.meta.env.BASE_URL);
    } catch {
      setError("This invitation is invalid, expired, or has already been used.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-slate-900">Create your password</CardTitle>
          <CardDescription>Choose a password to activate your Rightsly account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-password">Password</Label>
              <Input id="invite-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-invite-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password-confirm">Confirm password</Label>
              <Input id="invite-password-confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} data-testid="input-invite-password-confirm" />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800" disabled={acceptInvitation.isPending} data-testid="button-accept-invite">
              {acceptInvitation.isPending ? "Activating..." : "Activate account"}
            </Button>
            <p className="text-center text-sm text-slate-500">
              Already activated? <Link href="/login" className="text-amber-700 hover:underline">Sign in</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}