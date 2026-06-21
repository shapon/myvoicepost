import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Mic, Loader2, Mail } from "lucide-react";
import Header from "@/components/landing/Header";
import Footer from "@/components/landing/Footer";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/v1/p/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase().trim() }),
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to send reset email");
      }

      setSubmitted(true);
    } catch (error: any) {
      toast({
        title: "Request failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 pt-24 pb-16 bg-gradient-to-br from-background via-background to-muted/30">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader className="space-y-1 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                  {submitted ? (
                    <Mail className="w-6 h-6 text-primary-foreground" />
                  ) : (
                    <Mic className="w-6 h-6 text-primary-foreground" />
                  )}
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">
                {submitted ? "Check your email" : "Forgot your password?"}
              </CardTitle>
              <CardDescription>
                {submitted
                  ? `We've sent a reset code to ${email}. Enter it on the next page.`
                  : "Enter your email and we'll send you a 6-character reset code."}
              </CardDescription>
            </CardHeader>

            {submitted ? (
              <CardFooter className="flex flex-col space-y-4 pt-2">
                <Button
                  asChild
                  className="w-full"
                  data-testid="button-go-to-reset"
                >
                  <Link href={`/reset-password?email=${encodeURIComponent(email)}`}>
                    Enter reset code
                  </Link>
                </Button>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="text-sm text-muted-foreground hover:underline"
                  data-testid="button-try-different-email"
                >
                  Try a different email
                </button>
              </CardFooter>
            ) : (
              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      data-testid="input-email"
                    />
                  </div>
                </CardContent>
                <CardFooter className="flex flex-col space-y-4">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-send-reset-code"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send reset code"
                    )}
                  </Button>
                  <p className="text-sm text-muted-foreground text-center">
                    Remember your password?{" "}
                    <Link href="/login" className="text-primary hover:underline" data-testid="link-login">
                      Sign in
                    </Link>
                  </p>
                </CardFooter>
              </form>
            )}
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
}
