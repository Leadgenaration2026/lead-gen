import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowRight, Zap, Mail, Phone } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Navigation */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-semibold text-slate-900">Lead Gen Pro</span>
          </div>
          <a href={getLoginUrl()} className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Sign In
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            Automate Your Lead Generation & Outreach
          </h1>
          <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto">
            Generate qualified leads with AI, send personalized emails with tracking, and trigger intelligent calls automatically.
          </p>
          <a href={getLoginUrl()} className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">
            Get Started
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 mt-20">
          <div className="bg-white p-8 rounded-lg border border-slate-200 hover:shadow-lg transition-shadow">
            <Zap className="w-8 h-8 text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">AI Lead Generation</h3>
            <p className="text-slate-600">Generate realistic leads from natural language instructions. Get company names, owner details, and contact info instantly.</p>
          </div>
          <div className="bg-white p-8 rounded-lg border border-slate-200 hover:shadow-lg transition-shadow">
            <Mail className="w-8 h-8 text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Email Campaigns</h3>
            <p className="text-slate-600">Create personalized email campaigns with dynamic variables. Track opens and clicks automatically.</p>
          </div>
          <div className="bg-white p-8 rounded-lg border border-slate-200 hover:shadow-lg transition-shadow">
            <Phone className="w-8 h-8 text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Retell.AI Calls</h3>
            <p className="text-slate-600">Trigger intelligent outbound calls automatically when leads open or click your emails.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to scale your outreach?</h2>
          <p className="text-blue-100 mb-8">Start generating leads and automating your sales process today.</p>
          <a href={getLoginUrl()} className="inline-flex items-center gap-2 bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors">
            Sign In to Get Started
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>
    </div>
  );
}
