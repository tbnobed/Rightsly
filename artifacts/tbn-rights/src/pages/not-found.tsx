import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center text-center p-4">
      <AlertCircle className="w-16 h-16 text-amber-500 mb-6" />
      <h1 className="text-4xl font-bold text-slate-900 tracking-tight mb-2">404 - Page Not Found</h1>
      <p className="text-lg text-slate-500 max-w-md mx-auto mb-8">
        The page you are looking for doesn't exist or has been moved.
      </p>
      <Button asChild className="bg-slate-900 hover:bg-slate-800 text-white">
        <Link href="/">Return to Dashboard</Link>
      </Button>
    </div>
  );
}
