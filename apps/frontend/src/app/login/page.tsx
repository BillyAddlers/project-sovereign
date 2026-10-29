"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useId } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin, useSession } from "@/hooks/use-session";
import { ApiError } from "@/lib/api";
import { type LoginInput, loginSchema } from "@/lib/schemas";

/** Seeded accounts for the assessment demo. Password is the same for all. */
const DEMO_PASSWORD = "password123";
const demoAccounts = [
  { email: "pm@demo.local", label: "Product Manager", hint: "full write access" },
  { email: "qa@demo.local", label: "Engineer · QA", hint: "assigned tasks only" },
  { email: "frontend@demo.local", label: "Engineer · Frontend", hint: "assigned tasks only" },
  { email: "backend@demo.local", label: "Engineer · Backend", hint: "assigned tasks only" },
  { email: "client@demo.local", label: "Client", hint: "read-only, client-visible" },
];

export default function LoginPage() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();

  const { data: session } = useSession();
  const login = useLogin();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  // Someone already signed in has no business on the login screen.
  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  const applyAccount = (email: string) => {
    form.setValue("email", email, { shouldValidate: true });
    form.setValue("password", DEMO_PASSWORD, { shouldValidate: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="grid w-full max-w-4xl gap-6 lg:grid-cols-2">
        <Card className="glass-lift">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Sign in</CardTitle>
            <CardDescription>Use one of the seeded demo accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              noValidate
              onSubmit={form.handleSubmit((values) =>
                login.mutate(values, { onSuccess: () => router.replace("/") }),
              )}
            >
              <div className="space-y-2">
                <Label htmlFor={emailId}>Email</Label>
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  placeholder="pm@demo.local"
                  aria-invalid={Boolean(form.formState.errors.email)}
                  {...form.register("email")}
                />
                {form.formState.errors.email ? (
                  <p role="alert" className="text-destructive text-sm">
                    {form.formState.errors.email.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor={passwordId}>Password</Label>
                <Input
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(form.formState.errors.password)}
                  {...form.register("password")}
                />
                {form.formState.errors.password ? (
                  <p role="alert" className="text-destructive text-sm">
                    {form.formState.errors.password.message}
                  </p>
                ) : null}
              </div>

              {login.error ? (
                <p role="alert" className="text-destructive text-sm">
                  {login.error instanceof ApiError
                    ? login.error.message
                    : "Could not sign you in. Try again."}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="glass-lift">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Demo accounts</CardTitle>
            <CardDescription>
              Click <span className="font-medium">Use</span> to fill the form. Password for every
              account: <span className="font-mono">{DEMO_PASSWORD}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {demoAccounts.map((account) => (
              <div
                key={account.email}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/60 bg-white/50 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.05]"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{account.label}</div>
                  <div className="text-muted-foreground truncate font-mono text-xs">
                    {account.email}
                  </div>
                  <div className="text-muted-foreground text-xs">{account.hint}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyAccount(account.email)}
                >
                  Use
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
