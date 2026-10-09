import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ScanEye, Eye, EyeOff, Mail, Lock, User, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import type { Profile } from '@/lib/supabase';

function AuthShell({ children, subtitle }: { children: ReactNode; subtitle: string }) {
  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="landing-dark relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div className="aurora" />
        <div className="dot-grid absolute inset-0" />
        <div className="streak top-[60%]" />
        <div className="absolute right-12 top-1/3 h-40 w-40 rounded-full border border-cyan-300/25 animate-spin-slow" />
        <div className="absolute right-20 top-[38%] h-24 w-24 rounded-full border border-dashed border-violet-300/20 animate-spin-slow [animation-direction:reverse]" />
        <Link to="/" className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 shadow-[0_0_24px_hsl(190_95%_50%/0.5)]">
            <ScanEye className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">CardioVisionAI</span>
        </Link>
        <div className="enter relative [--enter-delay:150ms]">
          <h2 className="text-3xl font-bold leading-tight">
            See what your retina reveals about your heart.
          </h2>
          <p className="mt-4 text-white/80">
            Explainable AI for cardiovascular risk awareness through retinal intelligence.
          </p>
          <div className="stagger mt-8 space-y-3">
            {[
              'AI-assisted retinal cardiovascular screening',
              'Groq vision AI interpretation of retinal images',
              'Retinal vascular biomarker extraction',
              'Professional PDF report generation',
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-3 text-sm text-white/90">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20">
                  <Heart className="h-3 w-3" />
                </div>
                {feat}
              </div>
            ))}
          </div>
        </div>
        <p className="relative text-xs text-white/60">
          For research and educational purposes only. Not a medical diagnostic tool.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col items-center justify-center bg-background px-6 py-12 lg:w-1/2">
        <div className="enter w-full max-w-md">
          <Link to="/" className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-medical">
              <ScanEye className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold">CardioVisionAI</span>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{subtitle}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      navigate('/home');
    }
  };

  return (
    <AuthShell subtitle="Welcome back">
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in to access your cardiovascular risk dashboard.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPwd ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Don't have an account?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Profile['role']>('patient');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email, password, fullName, role);
    setLoading(false);
    if (error) {
      setError(error);
    } else {
      navigate('/home');
    }
  };

  return (
    <AuthShell subtitle="Create your account">
      <p className="mt-2 text-sm text-muted-foreground">
        Start screening cardiovascular risk from retinal images today.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Jane Smith"
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="pl-10"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPwd ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="pl-10 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>I am a...</Label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { value: 'patient', label: 'Patient' },
              { value: 'doctor', label: 'Doctor' },
              { value: 'researcher', label: 'Researcher' },
            ] as const).map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                  role === r.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
