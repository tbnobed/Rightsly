import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAuth } from "@/contexts/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ShieldAlert } from "lucide-react";
import ssoIcon from "@/assets/sso-icon.png";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [ssoEnabled, setSsoEnabled] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoCode = params.get("sso_code");
    const ssoError = params.get("sso_error");

    if (ssoCode) {
      // Strip the one-time code from the URL immediately, then exchange it.
      const cleanUrl = new URL(window.location.href);
      cleanUrl.search = "";
      window.history.replaceState({}, "", cleanUrl.toString());

      fetch(`${import.meta.env.BASE_URL}api/auth/sso/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: ssoCode }),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("exchange failed"))))
        .then((data: { token?: string }) => {
          if (data?.token) {
            localStorage.setItem("auth_token", data.token);
            window.location.replace("/");
          } else {
            throw new Error("no token");
          }
        })
        .catch(() => {
          setError("SSO sign-in failed. Please try again or use email/password.");
        });
      return;
    }

    if (ssoError) {
      setError(
        ssoError === "account_disabled"
          ? "Your account is disabled. Contact an administrator."
          : ssoError === "not_provisioned"
            ? "Your account has not been set up in this system yet. Contact an administrator."
            : "SSO sign-in failed. Please try again or use email/password."
      );
      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}api/auth/sso/config`)
      .then((r) => r.json())
      .then((data: { enabled?: boolean }) => {
        if (!cancelled) setSsoEnabled(!!data?.enabled);
      })
      .catch(() => {
        if (!cancelled) setSsoEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSsoLogin = () => {
    window.location.href = `${import.meta.env.BASE_URL}api/auth/sso/login`;
  };

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    try {
      setError(null);
      await login(values);
    } catch (e: any) {
      setError(e.message || "Failed to sign in. Please check your credentials.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#14201C] p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#1D9E75]/15 via-[#14201C] to-[#14201C]"></div>
      </div>
      
      <Card className="w-full max-w-md z-10 border-[#2A3833] bg-[#101A16]/90 backdrop-blur-xl shadow-2xl">
        <CardHeader className="space-y-3 pb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-[3px] h-9 rounded-sm bg-[#C9A24B]" aria-hidden="true" />
            <CardTitle
              className="text-3xl font-medium text-[#F4F1E9] tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Rightsly
            </CardTitle>
          </div>
          <CardDescription className="text-[#8fa098]">
            Rights management, rightly ordered.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200 leading-tight">{error}</p>
                </div>
              )}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#c9d3ce]">Email address</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="name@tbn.tv" 
                        {...field} 
                        className="bg-[#0c1512]/60 border-[#2A3833] text-[#F4F1E9] placeholder:text-[#5F6B64] focus-visible:ring-[#1D9E75]"
                        data-testid="input-email"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[#c9d3ce]">Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="••••••••" 
                        {...field} 
                        className="bg-[#0c1512]/60 border-[#2A3833] text-[#F4F1E9] placeholder:text-[#5F6B64] focus-visible:ring-[#1D9E75]"
                        data-testid="input-password"
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <Button 
                type="submit" 
                className="w-full bg-[#1D9E75] hover:bg-[#178a65] text-[#F4F1E9] font-medium shadow-lg shadow-[#1D9E75]/20 transition-all mt-4"
                disabled={form.formState.isSubmitting}
                data-testid="button-submit-login"
              >
                {form.formState.isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </Form>
          {ssoEnabled && (
            <div className="mt-6 space-y-4">
              <div className="relative flex items-center">
                <div className="flex-grow border-t border-[#2A3833]"></div>
                <span className="mx-4 text-xs uppercase tracking-wider text-[#5F6B64]">or</span>
                <div className="flex-grow border-t border-[#2A3833]"></div>
              </div>
              <Button
                type="button"
                onClick={handleSsoLogin}
                className="w-full bg-[#1c2a25] hover:bg-[#24352f] text-[#F4F1E9] border border-[#2A3833] font-medium flex items-center justify-center gap-2"
                data-testid="button-sso-login"
              >
                <img src={ssoIcon} alt="" className="h-5 w-5 rounded" />
                Sign in with SSO
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
