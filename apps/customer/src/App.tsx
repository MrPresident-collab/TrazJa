import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { Bell, Briefcase, Camera, Check, ChevronRight, CircleHelp, Clock3, FileText, HandCoins, Home, LockKeyhole, Mail, MapPin, MessageCircle, Moon, Package, Pencil, Phone, Plus, RefreshCw, Search, Send, ShieldCheck, Settings, Smartphone, Star, Sun, Trash2, User, WalletCards, X, LogOut } from 'lucide-react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';

type Address = { id: string; label: string | null; address_line: string; locality: string | null; city: string | null; contact_name: string | null; contact_phone: string | null; instructions: string | null };
type ServiceLevel = { id: string; code: string; name: string; description: string | null; promised_minutes: number | null; same_day: boolean; scheduling_supported: boolean; max_schedule_minutes: number | null; schedule_start_minute: number | null; schedule_end_minute: number | null; schedule_interval_minutes: number | null };
type StopInput = { address_line: string; locality: string; city: string; contact_name: string; contact_phone: string; alternative_contact_phone: string; instructions: string };
type Delivery = { id: string; reference: string; status: string; quoted_amount: number | null; total_amount: number | null; currency: string; created_at: string; scheduled_for: string | null; service_level_id: string | null; delivery_stops: Array<{ id: string; sequence_no: number; stop_type: string; address_line: string; locality: string | null; city: string | null; contact_name: string | null; completed_at: string | null }>; delivery_packages: Array<{ id: string; description: string | null; package_type: string | null; fragile: boolean }> };
type Notification = { id: string; title: string; body: string | null; read_at: string | null; created_at: string; type: string };
type Draft = { id: string; reference: string; status: string };
type Quote = { id: string; total_amount: number; subtotal_amount: number; gratuity_amount: number; currency: string; valid_until: string | null };

const paymentOptions = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'multicaixa', label: 'Multicaixa' },
  { value: 'wallet', label: 'Carteira' },
] as const;
const gratuityOptions = [
  { value: '0', label: 'Não' },
  { value: '5', label: '5%' },
  { value: '10', label: '10%' },
  { value: 'custom', label: 'Personalizar' },
] as const;
const statuses: Record<string, string> = { draft: 'Rascunho', quoted: 'Cotado', confirmed: 'Confirmado', dispatching: 'A procurar estafeta', assigned: 'Estafeta atribuído', en_route_to_pickup: 'A caminho da recolha', at_pickup: 'Na recolha', picked_up: 'Recolhido', in_transit: 'Em trânsito', at_stop: 'Na paragem', delivered: 'Entregue', cancelled: 'Cancelado', failed: 'Falhou', returned: 'Devolvido' };
const money = (value: number | null | undefined, currency = 'AOA') => value == null ? '—' : new Intl.NumberFormat('pt-AO', { style: 'currency', currency }).format(value);
const unwrap = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const idempotency = () => `${crypto.randomUUID()}-${Date.now()}`;

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [splashSeen, setSplashSeen] = useState(() => sessionStorage.getItem('pegaja-splash-seen') === '1');
  const [welcomeSeen, setWelcomeSeen] = useState(() => sessionStorage.getItem('pegaja-welcome-seen') === '1');
  const [signupPending, setSignupPending] = useState(() => sessionStorage.getItem('pegaja-signup-pending') === '1');
  const [authStep, setAuthStep] = useState<'phone' | 'otp' | 'email' | 'signup-form' | 'signup-otp'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [signupData, setSignupData] = useState<SignupData | null>(() => {
    const stored = sessionStorage.getItem('pegaja-signup-data');
    return stored ? JSON.parse(stored) as SignupData : null;
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (authLoading) return <FullPage message="A preparar tudo para ti…" />;

  if (session?.user && signupPending) {
    return <SignupCompletionScreen
      user={session.user}
      data={signupData}
      onComplete={() => {
        sessionStorage.removeItem('pegaja-signup-pending');
        setSignupPending(false);
        setSignupData(null);
        sessionStorage.removeItem('pegaja-signup-data');
        setAuthStep('phone');
      }}
      onCancel={async () => {
        await supabase.auth.signOut();
        sessionStorage.removeItem('pegaja-signup-pending');
        setSignupPending(false);
        setSignupData(null);
        sessionStorage.removeItem('pegaja-signup-data');
        setWelcomeSeen(false);
        setAuthStep('phone');
      }}
    />;
  }

  if (!session?.user && !splashSeen) {
    return <SplashScreen onStart={() => {
      sessionStorage.setItem('pegaja-splash-seen', '1');
      setSplashSeen(true);
    }} />;
  }

  if (!session?.user && !welcomeSeen) {
    return <WelcomeScreen
      onPhoneContinue={(nextPhone) => {
        sessionStorage.setItem('pegaja-welcome-seen', '1');
        setWelcomeSeen(true);
        setPhone(nextPhone);
        setAuthStep('otp');
      }}
      onEmailContinue={() => {
        sessionStorage.setItem('pegaja-welcome-seen', '1');
        setWelcomeSeen(true);
        setEmail('');
        setAuthStep('email');
      }}
      onCreateAccount={() => {
        sessionStorage.setItem('pegaja-welcome-seen', '1');
        sessionStorage.setItem('pegaja-signup-pending', '1');
        setWelcomeSeen(true);
        setSignupPending(true);
        setAuthStep('signup-form');
      }}
    />;
  }

  if (!session?.user && authStep === 'otp') {
    return <PhoneVerificationScreen phone={phone} onBack={() => setWelcomeSeen(false)} onChangeNumber={() => setWelcomeSeen(false)} />;
  }

  if (!session?.user && authStep === 'email') {
    return <AuthScreen
      onBack={() => setWelcomeSeen(false)}
      onContinue={(nextEmail) => {
        setEmail(nextEmail);
      }}
    />;
  }

  if (!session?.user && authStep === 'signup-form') {
    return <SignupFormScreen
      onContinue={(data) => {
        setSignupData(data);
        sessionStorage.setItem('pegaja-signup-data', JSON.stringify(data));
        setPhone(data.phone);
        setAuthStep('signup-otp');
      }}
      onBack={() => {
        sessionStorage.removeItem('pegaja-signup-pending');
        setSignupPending(false);
        setWelcomeSeen(false);
        setAuthStep('phone');
      }}
    />;
  }

  if (!session?.user && authStep === 'signup-otp') {
    return <SignupVerificationScreen
      phone={phone}
      onBack={() => setAuthStep('signup-form')}
      onChangeNumber={() => setAuthStep('signup-form')}
    />;
  }

  if (!session?.user) {
    return <WelcomeScreen
      onPhoneContinue={(nextPhone) => {
        sessionStorage.setItem('pegaja-welcome-seen', '1');
        setWelcomeSeen(true);
        setPhone(nextPhone);
        setAuthStep('otp');
      }}
      onEmailContinue={() => {
        sessionStorage.setItem('pegaja-welcome-seen', '1');
        setWelcomeSeen(true);
        setAuthStep('email');
      }}
      onCreateAccount={() => {
        sessionStorage.setItem('pegaja-welcome-seen', '1');
        sessionStorage.setItem('pegaja-signup-pending', '1');
        setWelcomeSeen(true);
        setSignupPending(true);
        setAuthStep('signup-form');
      }}
    />;
  }

  return <CustomerShell user={session.user} />;
}


function SplashScreen({ onStart }: { onStart: () => void }) {
  return <main className="splash-screen" aria-label="PegaJá">
    <section className="splash-brand">
      <img
        src="/pega-ja-handoff.svg"
        alt="PegaJá"
        className="splash-logo"
      />
      <h1>PEGAJÁ</h1>
      <p>Tudo que precisa ir, Chega!</p>
    </section>
    <button className="splash-cta" type="button" onClick={onStart}>
      Próximo <ChevronRight size={18} aria-hidden="true" />
    </button>
  </main>;
}

type SignupData = {
  firstName: string;
  surname: string;
  phone: string;
  email: string;
  home: { address_line: string; locality: string; reference: string };
  secondary: { label: string; address_line: string; locality: string; reference: string } | null;
};

function normalizeAngolaPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const local = digits.startsWith('244') ? digits.slice(3) : digits;
  return local.length === 9 ? `+244${local}` : '';
}

function formatAngolaPhone(phone: string) {
  const digits = phone.replace(/\D/g, '').replace(/^244/, '').slice(0, 9);
  return digits.length === 9 ? `+244 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}` : `+244 ${digits}`;
}

function WelcomeScreen({ onPhoneContinue, onEmailContinue, onCreateAccount }: {
  onPhoneContinue: (phone: string) => void;
  onEmailContinue: () => void;
  onCreateAccount: () => void;
}) {
  const [phone, setPhone] = useState('');
  const normalizedPhone = normalizeAngolaPhone(phone);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (normalizedPhone) onPhoneContinue(normalizedPhone);
  };

  return <main className="welcome-screen">
    <div className="welcome-image-wrap">
      <img
        src="https://images.pexels.com/photos/6868626/pexels-photo-6868626.jpeg?cs=srgb&dl=pexels-kindelmedia-6868626.jpg&fm=jpg"
        alt="Mulher africana a receber uma encomenda de um estafeta"
        className="welcome-image"
      />
    </div>
    <section className="welcome-copy">
      <p className="welcome-tagline">Tudo que precisa ir, Chega!</p>
      <p className="welcome-support">Você prepara.<br />Nós entregamos.</p>
    </section>
    <form className="welcome-auth" onSubmit={submit}>
      <label htmlFor="welcome-phone">Telefone</label>
      <div className="phone-input">
        <span>+244</span>
        <input
          id="welcome-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="9XX XXX XXX"
          value={phone}
          onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 9))}
          aria-label="Número de telefone"
        />
      </div>
      <button className="primary welcome-continue" type="submit" disabled={!normalizedPhone}>CONTINUAR</button>

    </form>
    <div className="welcome-divider"><span>ou</span></div>
    <button className="welcome-email" onClick={onEmailContinue}>Continuar com Email</button>
    <p className="welcome-create">Não tens conta? <button onClick={onCreateAccount}>Criar conta</button></p>
  </main>;
}

function SignupFormScreen({ onContinue, onBack }: { onContinue: (data: SignupData) => void; onBack: () => void }) {
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [address, setAddress] = useState('');
  const [locality, setLocality] = useState('');
  const [reference, setReference] = useState('');
  const [secondaryEnabled, setSecondaryEnabled] = useState(false);
  const [secondaryLabel, setSecondaryLabel] = useState('Trabalho');
  const [secondaryAddress, setSecondaryAddress] = useState('');
  const [secondaryLocality, setSecondaryLocality] = useState('');
  const [secondaryReference, setSecondaryReference] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const normalizedPhone = normalizeAngolaPhone(phone);
  const canContinue = Boolean(
    firstName.trim() &&
    surname.trim() &&
    address.trim() &&
    locality.trim() &&
    reference.trim() &&
    normalizedPhone &&
    (!secondaryEnabled || (secondaryLabel && secondaryAddress.trim() && secondaryLocality.trim() && secondaryReference.trim()))
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canContinue) return;
    onContinue({
      firstName: firstName.trim(),
      surname: surname.trim(),
      phone: normalizedPhone,
      email: email.trim(),
      home: { address_line: address.trim(), locality: locality.trim(), reference: reference.trim() },
      secondary: secondaryEnabled ? {
        label: secondaryLabel,
        address_line: secondaryAddress.trim(),
        locality: secondaryLocality.trim(),
        reference: secondaryReference.trim()
      } : null
    });
  };

  return <main className="signup-screen">
    <div className="signup-top">
      <button className="text-button signup-back" onClick={onBack} aria-label="Voltar">←</button>
    </div>
    <section className="signup-content signup-form-content">
      <p className="eyebrow">Criar conta</p>
      <h1>Os teus dados.</h1>
      <p className="signup-copy">Precisamos destes dados para tornar as tuas entregas mais simples.</p>
      <form className="stack signup-form" onSubmit={submit}>
        <div className="two-col">
          <label>Nome<input required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" placeholder="Nome" /></label>
          <label>Apelido<input required value={surname} onChange={(e) => setSurname(e.target.value)} autoComplete="family-name" placeholder="Apelido" /></label>
        </div>

        <div className="signup-location">
          <div className="signup-section-title"><strong>Casa</strong><span>Principal</span></div>
          <label>Endereço<input required value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" placeholder="Rua, número, edifício..." /></label>
          <div className="two-col">
            <label>Localidade<input required value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Localidade" /></label>
            <label>Referência<input required value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Ponto de referência" /></label>
          </div>
        </div>

        <div className="signup-location signup-secondary-location">
          <div className="signup-section-title"><strong>Outra localização</strong><span>Opcional</span></div>
          <label className="choice-label">Tipo
            <select value={secondaryLabel} onChange={(e) => setSecondaryLabel(e.target.value)} disabled={!secondaryEnabled}>
              <option>Trabalho</option>
              <option>Escola</option>
              <option>Escritório</option>
              <option>Outro</option>
            </select>
          </label>
          {!secondaryEnabled ? (
            <button type="button" className="secondary signup-add-location" onClick={() => setSecondaryEnabled(true)}>+ Adicionar localização</button>
          ) : <>
            <label>Endereço<input required value={secondaryAddress} onChange={(e) => setSecondaryAddress(e.target.value)} placeholder="Rua, número, edifício..." /></label>
            <div className="two-col">
              <label>Localidade<input required value={secondaryLocality} onChange={(e) => setSecondaryLocality(e.target.value)} placeholder="Localidade" /></label>
              <label>Referência<input required value={secondaryReference} onChange={(e) => setSecondaryReference(e.target.value)} placeholder="Ponto de referência" /></label>
            </div>
            <button type="button" className="text-button signup-remove-location" onClick={() => setSecondaryEnabled(false)}>Remover localização</button>
          </>}
        </div>

        <label>Email <span className="optional-label">(opcional)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="nome@exemplo.com" /></label>

        <label>Telefone<input required type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="9XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 9))} /></label>

        <button className="primary" type="submit" disabled={!canContinue}>CONTINUAR</button>
      </form>
      <p className="microcopy signup-security">O número de telefone será verificado no passo seguinte.</p>
    </section>
  </main>;
}

function SignupVerificationScreen({ phone, onBack, onChangeNumber }: { phone: string; onBack: () => void; onChangeNumber: () => void }) {
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300);
  const [busy, setBusy] = useState(true);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const sendCode = async () => {
    setError('');
    setResending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
    if (otpError) setError('Não foi possível enviar o código. Tenta novamente.');
    else { setSecondsLeft(60); setExpirySeconds(300); }
    setResending(false);
  };

  useEffect(() => {
    let cancelled = false;
    const sendInitialCode = async () => {
      setError('');
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
      if (cancelled) return;
      if (otpError) setError('Não foi possível enviar o código. Tenta novamente.');
      setBusy(false);
      inputRef.current?.focus();
    };
    void sendInitialCode();
    return () => { cancelled = true; };
  }, [phone]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (expirySeconds <= 0) return;
    const timer = window.setInterval(() => setExpirySeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [expirySeconds]);

  useEffect(() => {
    if (code.length !== 6 || busy || resending) return;
    let cancelled = false;
    const verify = async () => {
      setBusy(true);
      setError('');
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (cancelled) return;
      if (verifyError) {
        setError('O código não é válido ou já expirou.');
        setCode('');
        setBusy(false);
        inputRef.current?.focus();
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, [code, phone, busy, resending]);

  const handleCodeChange = (value: string) => {
    setError('');
    setCode(value.replace(/\D/g, '').slice(0, 6));
  };

  return <main className="phone-verify-screen signup-verify-screen">
    <div className="phone-verify-top">
      <button className="text-button phone-verify-back" onClick={onBack} aria-label="Voltar">←</button>
    </div>
    <section className="phone-verify-content">
      <p className="eyebrow">Criar conta</p>
      <h1>Verificar número</h1>
      <p className="phone-verify-copy">Enviámos um código de 6 dígitos<br />para</p>
      <strong className="phone-verify-number">{formatAngolaPhone(phone)}</strong>
      <label className="sr-only" htmlFor="signup-otp">Código de verificação</label>
      <div className="otp-slots" aria-hidden="true">{Array.from({ length: 6 }, (_, index) => <span key={index} className={code[index] ? 'filled' : ''}>{code[index] || '_'}</span>)}</div>
      <input ref={inputRef} id="signup-otp" className="otp-input" type="tel" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => handleCodeChange(event.target.value)} disabled={busy || resending} aria-label="Código de 6 dígitos" />
      <p className="otp-expiry">O código expira em {Math.floor(expirySeconds / 60)}:{String(expirySeconds % 60).padStart(2, '0')}</p>
      {error && <p className="error phone-verify-error">{error}</p>}
      <div className="otp-resend"><span>Não recebeste o código?</span><button className="text-button" onClick={sendCode} disabled={secondsLeft > 0 || resending}>{resending ? 'A reenviar…' : 'Reenviar código'}</button></div>
      <button className="change-phone" onClick={onChangeNumber}>Alterar número</button>
    </section>
  </main>;
}

function SignupCompletionScreen({ user, data, onComplete, onCancel }: { user: AuthUser; data: SignupData | null; onComplete: () => void; onCancel: () => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const complete = async () => {
      setBusy(true);
      setError('');
      const fullName = data.firstName + ' ' + data.surname;

      if (data.email) {
        const { error: emailError } = await supabase.auth.updateUser({ email: data.email.toLowerCase() });
        if (cancelled) return;
        if (emailError) {
          setError('Não foi possível associar esse email à conta. Confirma o endereço e tenta novamente.');
          setBusy(false);
          return;
        }
      }

      const { error: completionError } = await supabase.rpc('complete_customer_signup', {
        p_full_name: fullName,
        p_email: data.email || null,
        p_phone: data.phone,
        p_home: data.home,
        p_secondary: data.secondary
      });
      if (cancelled) return;
      if (completionError) setError('Não foi possível finalizar a tua conta. Tenta novamente.');
      else onComplete();
      setBusy(false);
    };
    void complete();
    return () => { cancelled = true; };
  }, [data]);

  return <main className="signup-screen signup-completion-screen">
    <section className="signup-content">
      <p className="eyebrow">Criar conta</p>
      <h1>{busy ? 'A preparar a tua conta.' : 'Conta criada.'}</h1>
      <p className="signup-copy">{busy ? 'Estamos a guardar os teus dados.' : data?.email ? 'A tua conta está pronta. Enviámos uma mensagem para confirmar o teu email.' : 'Já podes entrar no PegaJá.'}</p>
      {error && <p className="error">{error}</p>}
      {error && <button className="primary" onClick={() => window.location.reload()}>Tentar novamente</button>}
      <p className="microcopy signup-security">O número de telefone foi verificado. O email é opcional e só fica disponível como acesso depois de ser confirmado.</p>
    </section>
  </main>;
}

function PhoneVerificationScreen({ phone, onBack, onChangeNumber }: { phone: string; onBack: () => void; onChangeNumber: () => void }) {
  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [expirySeconds, setExpirySeconds] = useState(300);
  const [busy, setBusy] = useState(true);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const sendCode = async () => {
    setError('');
    setResending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
    if (otpError) {
      setError('Não foi possível enviar o código. Tenta novamente.');
    } else {
      setSecondsLeft(60);
      setExpirySeconds(300);
    }
    setResending(false);
  };

  useEffect(() => {
    let cancelled = false;
    const sendInitialCode = async () => {
      setError('');
      const { error: otpError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });
      if (cancelled) return;
      if (otpError) setError('Não foi possível enviar o código. Tenta novamente.');
      setBusy(false);
      inputRef.current?.focus();
    };
    void sendInitialCode();
    return () => { cancelled = true; };
  }, [phone]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  useEffect(() => {
    if (expirySeconds <= 0) return;
    const timer = window.setInterval(() => setExpirySeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [expirySeconds]);

  useEffect(() => {
    if (code.length !== 6 || busy || resending) return;
    let cancelled = false;
    const verify = async () => {
      setBusy(true);
      setError('');
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
      if (cancelled) return;
      if (verifyError) {
        setError('O código não é válido ou já expirou.');
        setCode('');
        setBusy(false);
        inputRef.current?.focus();
      }
    };
    void verify();
    return () => { cancelled = true; };
  }, [code, phone, busy, resending]);

  const handleCodeChange = (value: string) => {
    setError('');
    setCode(value.replace(/\D/g, '').slice(0, 6));
  };

  return <main className="phone-verify-screen">
    <div className="phone-verify-top">
      <button className="text-button phone-verify-back" onClick={onBack} aria-label="Voltar">←</button>
    </div>
    <section className="phone-verify-content">
      <h1>Verificar número</h1>
      <p className="phone-verify-copy">Enviámos um código de 6 dígitos<br />para</p>
      <strong className="phone-verify-number">{formatAngolaPhone(phone)}</strong>
      <label className="sr-only" htmlFor="phone-otp">Código de verificação</label>
      <div className="otp-slots" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <span key={index} className={code[index] ? 'filled' : ''}>{code[index] || '_'}</span>)}
      </div>
      <input
        ref={inputRef}
        id="phone-otp"
        className="otp-input"
        type="tel"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => handleCodeChange(event.target.value)}
        disabled={busy || resending}
        aria-label="Código de 6 dígitos"
      />
      <p className="otp-expiry">O código expira em {Math.floor(expirySeconds / 60)}:{String(expirySeconds % 60).padStart(2, '0')}</p>
      {error && <p className="error phone-verify-error">{error}</p>}
      <div className="otp-resend">
        <span>Não recebeste o código?</span>
        <button className="text-button" onClick={sendCode} disabled={secondsLeft > 0 || resending}>{resending ? 'A reenviar…' : 'Reenviar código'}</button>
      </div>
      <button className="change-phone" onClick={onChangeNumber}>Alterar número</button>
    </section>
  </main>;
}

function AuthScreen({ onBack, onContinue }: { onBack: () => void; onContinue: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (busy || !normalizedEmail || !password) return;
    setBusy(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (authError) {
      setError('Email ou palavra-passe inválidos.');
      setBusy(false);
      return;
    }
    onContinue(normalizedEmail);
  };

  return <main className="auth-page">
    <div className="auth-card">
      <button className="text-button auth-back" onClick={onBack} type="button">← Voltar</button>
      <div className="brand-mark">P<span>J</span></div>
      <p className="eyebrow">Entrar com email</p>
      <h1>Acede à tua conta.</h1>
      <p className="muted">Acesso de desenvolvimento com as credenciais existentes no Supabase.</p>
      <form onSubmit={submit} className="stack">
        <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="nome@exemplo.com" /></label>
        <label>Palavra-passe<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Palavra-passe" /></label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy || !email.trim() || !password}>{busy ? 'A entrar…' : 'ENTRAR'}</button>
      </form>
      <p className="microcopy">Este método não cria contas e destina-se apenas ao desenvolvimento.</p>
    </div>
  </main>;
}

function CustomerShell({ user }: { user: AuthUser }) {
  const [tab, setTab] = useState<'send' | 'activities' | 'profile'>('send');
  const [refreshToken, setRefreshToken] = useState(0);
  const [paulaOpen, setPaulaOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  useEffect(() => {
    const openPaula = () => setPaulaOpen(true);
    const openNotifications = () => setNotificationsOpen(true);
    window.addEventListener('pegaja-open-paula', openPaula);
    window.addEventListener('pegaja-open-notifications', openNotifications);
    return () => {
      window.removeEventListener('pegaja-open-paula', openPaula);
      window.removeEventListener('pegaja-open-notifications', openNotifications);
    };
  }, []);
  return <div className="app-shell"><main className="page-content">{tab === 'send' && <HomeTab user={user} onCreated={() => { setRefreshToken((n) => n + 1); setTab('activities'); }} onOpenPaula={() => setPaulaOpen(true)} />}{tab === 'activities' && <ShipmentsTab refreshToken={refreshToken} />}{tab === 'profile' && <ProfileTab user={user} />}</main>
    <nav className="bottom-nav" aria-label="Navegação principal"><NavButton active={tab === 'send'} icon={<Send size={20} />} label="Enviar" onClick={() => setTab('send')} /><NavButton active={tab === 'activities'} icon={<RefreshCw size={20} />} label="Atividades" onClick={() => setTab('activities')} /><NavButton active={tab === 'profile'} icon={<User size={20} />} label="Perfil" onClick={() => setTab('profile')} /></nav>{paulaOpen && <PaulaModal onClose={() => setPaulaOpen(false)} />}{notificationsOpen && <div className="modal-backdrop"><div className="modal-sheet profile-notifications-sheet"><NotificationsTab /><button className="primary" onClick={() => setNotificationsOpen(false)}>Fechar</button></div></div>}</div>;
}
function NavButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>; }

function HomeTab({ user, onCreated, onOpenPaula }: { user: AuthUser; onCreated: () => void; onOpenPaula: () => void }) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [levels, setLevels] = useState<ServiceLevel[]>([]);
  const [activeDeliveries, setActiveDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('addresses').select('id,label,address_line,locality,city,contact_name,contact_phone,instructions').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('service_levels').select('id,code,name,description,promised_minutes,same_day,scheduling_supported,max_schedule_minutes,schedule_start_minute,schedule_end_minute,schedule_interval_minutes').eq('active', true).order('sort_order').limit(30),
      supabase.from('deliveries').select('id,reference,status,quoted_amount,total_amount,currency,created_at,scheduled_for,service_level_id,delivery_stops(id,sequence_no,stop_type,address_line,locality,city,contact_name,completed_at),delivery_packages(id,description,package_type,fragile)').in('status', ['dispatching','assigned','en_route_to_pickup','at_pickup','picked_up','in_transit','at_stop']).order('created_at', { ascending: false }).limit(3)
    ]).then(([a, s, d]) => {
      if (a.error || s.error || d.error) setError('Não conseguimos carregar tudo agora. Tenta novamente daqui a pouco.');
      setAddresses(a.data || []);
      setLevels(s.data || []);
      setActiveDeliveries((d.data as Delivery[]) || []);
      setLoading(false);
    });
  }, [user.id]);

  if (showNew) return <NewShipment user={user} addresses={addresses} levels={levels} onCancel={() => setShowNew(false)} onCreated={onCreated} />;

  const active = activeDeliveries[0] || null;
  const activeStop = active?.delivery_stops?.find((stop) => stop.stop_type === 'dropoff') || active?.delivery_stops?.at(-1);
  const activeStatus = active ? (statuses[active.status] || active.status) : '';
  const destination = activeStop?.locality || activeStop?.address_line || 'Destino';

  return <section className="home-dashboard">
    <div className="home-header">
      <button className="paula-stack" onClick={onOpenPaula} aria-label="Pergunta a Paula">
        <span className="paula-person">🙎🏾‍♀️</span>
        <span>Pergunta a Paula</span>
      </button>
      <button className="home-location" type="button" aria-label="Endereço de recolha">
        <span className="home-location-icon"><MapPin size={18} /></span>
        <span><strong>{addresses[0]?.label || addresses[0]?.locality || addresses[0]?.address_line || 'Adicionar endereço'}</strong></span>
        <ChevronRight size={18} />
      </button>
    </div>

    <div className="home-map-card" aria-label="Mapa">
      <div className="map-grid" />
      <div className="map-road map-road-a" />
      <div className="map-road map-road-b" />
      <div className="map-route"><span className="map-pin pickup"><MapPin size={15} /></span><span className="map-line" /><span className="map-pin destination"><Package size={15} /></span></div>
      <div className="map-caption"><span><i className="status-dot" /> {active ? activeStatus : 'A tua zona'}</span>{active && <strong>{destination}</strong>}</div>
    </div>

    <div className="home-prompt">O que precisa ir?</div>

    <button className="home-new-shipment" onClick={() => setShowNew(true)} disabled={loading || levels.length === 0}>
      <span className="home-new-icon"><Plus size={25} /></span>
      <span><strong>Novo envio</strong><small>Prepara uma entrega em poucos passos</small></span>
      <ChevronRight size={20} />
    </button>

    {levels.length === 0 && !loading && <div className="notice">O envio está temporariamente indisponível. Tenta novamente daqui a pouco.</div>}
    {error && <div className="error">{error}</div>}

    <section className="home-active">
      <div className="home-section-heading"><div><p className="eyebrow">Em movimento</p></div></div>
      {active ? <div className="active-shipment-card">
        <div className="active-route">
          <div><span className="route-dot pickup-dot" /><div><small>Recolha</small><strong>{active.delivery_stops?.[0]?.locality || active.delivery_stops?.[0]?.address_line || 'Origem'}</strong></div></div>
          <div className="route-connector" />
          <div><span className="route-dot destination-dot" /><div><small>Destino</small><strong>{destination}</strong></div></div>
        </div>
        <div className="active-footer"><span>{activeStatus}</span><strong>{money(active.total_amount ?? active.quoted_amount, active.currency)}</strong></div>
      </div> : <div className="empty home-movement-empty"><strong>Ainda não tens nenhum envio em movimento.</strong><p>Faz o teu primeiro envio e acompanha o pacote aqui.</p></div>}
    </section>
  </section>;
}
function Step({ number, title, body }: { number: string; title: string; body: string }) { return <div className="step"><span>{number}</span><div><strong>{title}</strong><p>{body}</p></div></div>; }

function NewShipment({ user, addresses, levels, onCancel, onCreated }: { user: AuthUser; addresses: Address[]; levels: ServiceLevel[]; onCancel: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(0);
  const [pickupId, setPickupId] = useState(addresses[0]?.id || '');
  const [customPickup, setCustomPickup] = useState<StopInput>({ address_line:'', locality:'', city:'Luanda', contact_name:'', contact_phone:'', alternative_contact_phone:'', instructions:'' });
  const [destination, setDestination] = useState<StopInput>({ address_line:'', locality:'', city:'', contact_name:'', contact_phone:'', alternative_contact_phone:'', instructions:'' });
  const [stops, setStops] = useState<StopInput[]>([]);
  const [pkg, setPkg] = useState({ package_type:'', package_size:'', description:'', declared_value:'', fragile:false, legalConsent:false });
  const [file, setFile] = useState<File|null>(null);
  const [preview, setPreview] = useState('');
  const [levelId, setLevelId] = useState(levels[0]?.id || '');
  const [deliveryMode, setDeliveryMode] = useState<'now'|'scheduled'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [quote, setQuote] = useState<Quote|null>(null);
  const [draft, setDraft] = useState<Draft|null>(null);
  const [payment, setPayment] = useState<(typeof paymentOptions)[number]['value']>('cash');
  const [gratuity, setGratuity] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement>(null);

  const selectedLevel = levels.find((item) => item.id === levelId);
  const pickup = addresses.find((address) => address.id === pickupId);
  const scheduledFor = deliveryMode === 'scheduled' && scheduledDate ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString() : null;
  const packageChoices = [
    { value:'Envelope', icon:'📄', description:'Documentos, chaves, papéis, carregadores e semelhantes.' },
    { value:'Pequeno', icon:'📦', description:'Tamanho de uma caixa de sapatos, saco de compras ou saco de arroz.' },
    { value:'Médio', icon:'🎒', description:'Tamanho de uma mochila ou mala.' },
    { value:'Grande', icon:'🚚', description:'Requer carrinha.' },
  ];
  const scheduleLevels = levels.filter((item) => item.scheduling_supported);
  const availableLevels = deliveryMode === 'scheduled' ? scheduleLevels : levels;
  const canContinue =
    step === 0 ? Boolean((pickupId || (customPickup.address_line.trim() && customPickup.locality.trim())) && destination.address_line.trim() && destination.locality.trim() && destination.contact_name.trim() && destination.contact_phone.trim() && stops.every((stop) => stop.address_line.trim() && stop.locality.trim())) :
    step === 1 ? Boolean(pkg.package_type && pkg.description.trim() && pkg.legalConsent && file) :
    step === 2 ? Boolean(levelId && (deliveryMode === 'now' || (scheduledDate && scheduledTime && selectedLevel?.scheduling_supported && selectedLevel.max_schedule_minutes && selectedLevel.schedule_start_minute != null && selectedLevel.schedule_end_minute != null && selectedLevel.schedule_interval_minutes))) :
    step === 3 ? Boolean(quote && payment) : Boolean(quote && payment && draft);

  const updateDestination = (field: keyof StopInput, value: string) => setDestination((current) => ({ ...current, [field]: value }));
  const handleFile = (next: File|null) => {
    if (!next) return;
    if (!['image/jpeg','image/webp'].includes(next.type)) { setError('A fotografia deve ser JPEG ou WebP.'); return; }
    if (next.size > 10 * 1024 * 1024) { setError('A fotografia deve ter no máximo 10 MB.'); return; }
    setFile(next); setPreview(URL.createObjectURL(next)); setError('');
  };
  const emptyStop = (): StopInput => ({ address_line:'', locality:'', city:'', contact_name:'', contact_phone:'', alternative_contact_phone:'', instructions:'' });
  const addStops = () => setStops((current) => current.length === 0 ? [emptyStop(), emptyStop()] : [...current, emptyStop(), emptyStop()]);
  const updateStop = (index:number, field:keyof StopInput, value:string) => setStops((current) => current.map((stop,i) => i===index ? { ...stop, [field]:value } : stop));
  const removeStop = (index:number) => setStops((current) => current.length <= 2 ? [] : current.filter((_,i) => i !== index));

  const prepareQuote = async () => {
    setBusy(true); setError('');
    try {
      const serviceLevelId = levelId || availableLevels[0]?.id;
      if (!serviceLevelId) throw new Error('Nenhum serviço de entrega está disponível neste momento.');
      const { data: draftData, error: draftError } = await supabase.rpc('create_delivery_draft', {
        p_idempotency_key:idempotency(),
        p_service_level_id:serviceLevelId,
        p_scheduled_for:scheduledFor,
        p_notes:destination.instructions.trim() || null
      });
      if (draftError) throw draftError;
      const created = unwrap<Draft>(draftData);
      if (!created) throw new Error('Não conseguimos preparar o teu envio. Tenta novamente.');

      const pickupRow = pickup ? {
        delivery_id:created.id, sequence_no:1, stop_type:'pickup', address_id:pickup.id,
        address_line:pickup.address_line, locality:pickup.locality, city:pickup.city,
        contact_name:pickup.contact_name, contact_phone:pickup.contact_phone,
        alternative_contact_phone:null, instructions:pickup.instructions
      } : {
        delivery_id:created.id, sequence_no:1, stop_type:'pickup', address_id:null,
        address_line:customPickup.address_line.trim(), locality:customPickup.locality.trim() || null,
        city:customPickup.city.trim() || null, contact_name:null, contact_phone:null,
        alternative_contact_phone:null, instructions:customPickup.instructions.trim() || null
      };

      const stopRows = [
        pickupRow,
        ...stops.map((stop,index) => ({
          delivery_id:created.id, sequence_no:index+2, stop_type:'waypoint', address_id:null,
          address_line:stop.address_line.trim(), locality:stop.locality.trim() || null, city:stop.city.trim() || null,
          contact_name:stop.contact_name.trim() || null, contact_phone:stop.contact_phone.trim() || null,
          alternative_contact_phone:stop.alternative_contact_phone.trim() || null, instructions:stop.instructions.trim() || null
        })),
        {
          delivery_id:created.id, sequence_no:stops.length+2, stop_type:'dropoff', address_id:null,
          address_line:destination.address_line.trim(), locality:destination.locality.trim() || null, city:destination.city.trim() || null,
          contact_name:destination.contact_name.trim(), contact_phone:destination.contact_phone.trim(),
          alternative_contact_phone:destination.alternative_contact_phone.trim() || null, instructions:destination.instructions.trim() || null
        }
      ];

      if (stops.length === 1) throw new Error('Uma rota com paragens intermédias precisa de pelo menos 2 paragens.');
      const { data:stopData,error:stopError } = await supabase.from('delivery_stops').insert(stopRows).select('id,sequence_no,stop_type').order('sequence_no');
      if (stopError) throw stopError;

      const { data:packageData,error:packageError } = await supabase.from('delivery_packages').insert({
        delivery_id:created.id, package_type:pkg.package_type, metadata:{ package_size:pkg.package_size || pkg.package_type },
        description:pkg.description.trim(), declared_value:pkg.declared_value ? Number(pkg.declared_value) : null, fragile:pkg.fragile
      }).select('id').single();
      if (packageError) throw packageError;

      const extension=file!.type==='image/webp'?'webp':'jpg';
      const objectPath=`customer-package/${user.id}/${created.id}/${crypto.randomUUID()}.${extension}`;
      const { error:uploadError } = await supabase.storage.from('delivery-evidence').upload(objectPath,file!,{contentType:file!.type,upsert:false});
      if (uploadError) throw uploadError;
      const { error:evidenceError } = await supabase.from('delivery_evidence').insert({
        delivery_id:created.id, package_id:packageData.id, stop_id:stopData?.[0]?.id || null,
        bucket_id:'delivery-evidence', object_path:objectPath, evidence_type:'customer_package_photo',
        captured_by:user.id, metadata:{source:'camera_capture_required',content_type:file!.type}
      });
      if (evidenceError) throw evidenceError;

      const { error:consentError } = await supabase.from('delivery_policy_acceptances').insert({
        delivery_id:created.id, user_id:user.id, policy_code:'customer_delivery_terms',
        policy_version:'v1'
      });
      if (consentError) throw consentError;

      const { data:quoteData,error:quoteError } = await supabase.rpc('calculate_delivery_quote',{p_delivery_id:created.id,p_service_level_id:serviceLevelId});
      if (quoteError) throw quoteError;
      const nextQuote=unwrap<Quote>(quoteData);
      if (!nextQuote) throw new Error('Não conseguimos calcular o valor da entrega agora. Tenta novamente.');
      setDraft(created); setQuote(nextQuote); setStep(4);
    } catch (cause) {
      const raw=cause instanceof Error ? cause.message : '';
      const friendly = raw.includes('service level unavailable') ? 'Este serviço de entrega já não está disponível.' :
        raw.includes('scheduled time cannot be in the past') ? 'Escolhe uma data e hora futuras.' :
        raw.includes('permission denied') ? 'Não foi possível guardar este envio. Tenta novamente.' :
        raw || 'Não foi possível preparar o envio. Tenta novamente.';
      setError(friendly);
    } finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!draft || !quote) return;
    setBusy(true); setError('');
    const gratuityAmount = gratuity === '0' ? 0 : quote.total_amount * (Number(gratuity) / 100);
    const { error:confirmError } = await supabase.rpc('confirm_delivery',{
      p_delivery_id:draft.id, p_payment_method:payment, p_gratuity_amount:gratuityAmount
    });
    if (confirmError) {
      const raw=confirmError.message || '';
      setError(raw.includes('payment method is not currently available') ? 'Esta forma de pagamento não está disponível neste momento.' :
        raw.includes('delivery terms must be accepted') ? 'Aceita os termos do envio para continuar.' :
        raw.includes('quote expired') ? 'A cotação expirou. Volta atrás e calcula novamente.' :
        raw || 'Não foi possível confirmar o envio. Tenta novamente.');
    } else onCreated();
    setBusy(false);
  };

  const next = () => {
    if (!canContinue) return;
    if (step === 2) { void prepareQuote(); return; }
    if (step === 4) { void confirm(); return; }
    setStep((value) => Math.min(4,value+1));
  };

  const renderCalendar = () => {
    const horizonMinutes = selectedLevel?.max_schedule_minutes;
    if (!horizonMinutes || horizonMinutes <= 0) return <div className="notice">Este serviço não tem uma janela de agendamento configurada.</div>;
    const days = Array.from({length: Math.max(1, Math.ceil(horizonMinutes / 1440) + 1)},(_,i) => {
      const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()+i); return d;
    }).filter((day) => day.getTime() <= Date.now() + horizonMinutes * 60000);
    return <div className="shipment-calendar">
      {days.map((day) => {
        const key=day.toISOString().slice(0,10);
        const selected=scheduledDate===key;
        return <button type="button" key={key} className={selected?'calendar-day selected':'calendar-day'} onClick={() => setScheduledDate(key)}>
          <small>{day.toLocaleDateString('pt-AO',{weekday:'short'}).replace('.','')}</small><strong>{day.getDate()}</strong><span>{day.toLocaleDateString('pt-AO',{month:'short'}).replace('.','')}</span>
        </button>;
      })}
    </div>;
  };

  const renderTimeWheel = () => {
    const start = selectedLevel?.schedule_start_minute;
    const end = selectedLevel?.schedule_end_minute;
    const interval = selectedLevel?.schedule_interval_minutes;
    if (start == null || end == null || interval == null || interval <= 0 || end <= start) return <div className="notice">Os horários de agendamento ainda não estão configurados para este serviço.</div>;
    const times=Array.from({length:Math.floor((end-start)/interval)+1},(_,i) => {
      const minutes=start+i*interval; return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    }).filter((time) => {
      if (scheduledDate !== new Date().toISOString().slice(0,10)) return true;
      const [hour, minute] = time.split(':').map(Number); const candidate = new Date(); candidate.setHours(hour, minute, 0, 0); return candidate.getTime() > Date.now();
    });
    return <div className="time-wheel"><div className="time-wheel-track">{times.map((time) => <button type="button" key={time} className={scheduledTime===time?'time-option selected':'time-option'} onClick={() => setScheduledTime(time)}>{time}</button>)}</div></div>;
  };

  return <section className="stack page-section shipment-flow">
    <div className="flow-heading"><button className="text-button" onClick={onCancel}><X size={18}/> Cancelar</button><span>Passo {step+1} de 5</span></div>
    <div className="progress"><span style={{width:`${((step+1)/5)*100}%`}} /></div>

    {step===0 && <>
      <div className="shipment-step-intro"><span className="shipment-step-number">1</span><div><p className="eyebrow">Da onde?</p><h1>Da onde?</h1></div></div>
      <div className="shipment-safety-note"><ShieldCheck size={19}/><strong>O pacote está bem embalado e seguro!</strong></div>
      <div className="shipment-address-choices">
        {addresses.map((address) => <button type="button" key={address.id} className={pickupId===address.id?'shipment-address-card selected':'shipment-address-card'} onClick={() => setPickupId(address.id)}><MapPin size={18}/><span><strong>{address.label || 'Endereço'}</strong><small>{address.address_line}{address.locality ? `, ${address.locality}` : ''}</small></span><ChevronRight size={17}/></button>)}
        <button type="button" className={!pickupId?'shipment-address-card selected':'shipment-address-card'} onClick={() => setPickupId('')}><Plus size={18}/><span><strong>Outro endereço</strong><small>Usar apenas neste envio</small></span><ChevronRight size={17}/></button>
      </div>
      {!pickupId && <AddressFields value={customPickup} onChange={(field,value) => setCustomPickup((current) => ({...current,[field]:value}))}/>}
    </>}

    {step===1 && <>
      <div className="shipment-step-intro"><span className="shipment-step-number">2</span><div><p className="eyebrow">Para onde?</p><h1>Para onde?</h1></div></div>
      <AddressFields value={destination} onChange={updateDestination}/>
      <div className="shipment-stops-section">
        <div className="section-heading-inline"><div><p className="eyebrow">Rota</p><strong>Paragens intermédias</strong><small>Se adicionares paragens, a rota terá no mínimo 3 locais.</small></div><button type="button" className="secondary" onClick={addStops}><Plus size={17}/> Adicionar 2 paragens</button></div>
        {stops.map((stop,index)=><div className="shipment-stop-card" key={index}><div className="section-heading-inline"><strong>Paragem {index+1}</strong><button type="button" className="text-button" onClick={()=>removeStop(index)} disabled={stops.length===2}>Remover</button></div><AddressFields value={stop} compact onChange={(field,value)=>updateStop(index,field,value)}/><label>Instruções <span className="optional-label">(opcional)</span><input value={stop.instructions} onChange={(e)=>updateStop(index,'instructions',e.target.value)} placeholder="Referência, portão, andar..."/></label></div>)}
      </div>
    </>}

    {step===2 && <>
      <div className="shipment-step-intro"><span className="shipment-step-number">3</span><div><p className="eyebrow">Sobre o pacote</p><h1>Estás a enviar:</h1></div></div>
      <div className="shipment-package-grid">
        {packageChoices.map((choice) => <button type="button" key={choice.value} className={pkg.package_type===choice.value?'shipment-package-card selected':'shipment-package-card'} onClick={() => setPkg({...pkg,package_type:choice.value,package_size:choice.value})}><span className="shipment-package-icon">{choice.icon}</span><strong>{choice.value}</strong><small>{choice.description}</small></button>)}
      </div>
      <label>O que contém?<input value={pkg.description} onChange={(e) => setPkg({...pkg,description:e.target.value})} placeholder="ex.: livro, roupa, electrónica..." /></label>
      <label>Valor declarado (Kz)<small className="field-hint">Valor aproximado do que estás a enviar.</small><input type="number" min="0" step="1" value={pkg.declared_value} onChange={(e) => setPkg({...pkg,declared_value:e.target.value})} placeholder="0" /></label>
      <label className="check-row"><input type="checkbox" checked={pkg.legalConsent} onChange={(e) => setPkg({...pkg,legalConsent:e.target.checked})}/> Aceito os termos do envio</label>
      <label className="check-row"><input type="checkbox" checked={pkg.fragile} onChange={(e) => setPkg({...pkg,fragile:e.target.checked})}/> É frágil?</label>
      <div className="evidence-box shipment-camera-box">{preview?<img src={preview} alt="Fotografia do pacote"/>:<><Camera size={30}/><strong>Fotografa o pacote</strong><small>Precisamos de uma fotografia do pacote antes da recolha.</small></>}<input ref={cameraRef} type="file" accept="image/jpeg,image/webp" capture="environment" onChange={(e)=>handleFile(e.target.files?.[0]||null)}/><button type="button" className="secondary" onClick={()=>cameraRef.current?.click()}>{preview?'Repetir fotografia':'Abrir câmara'}</button></div>
    </>}

    {step===3 && <>
      <div className="shipment-step-intro"><span className="shipment-step-number">4</span><div><p className="eyebrow">Entrega</p><h1>Como queres receber o serviço?</h1></div></div>
      <div className="shipment-delivery-mode-grid">
        <button type="button" className={deliveryMode==='now'?'shipment-mode-card selected':'shipment-mode-card'} onClick={()=>setDeliveryMode('now')}><strong>Entrega</strong><small>Envia assim que estiveres pronto.</small></button>
        <button type="button" className={deliveryMode==='scheduled'?'shipment-mode-card selected':'shipment-mode-card'} onClick={()=>setDeliveryMode('scheduled')}><strong>Agendar</strong><small>Escolhe o dia e a hora da recolha.</small></button>
      </div>
      <div className="stack shipment-service-list">{availableLevels.map((level)=><button type="button" key={level.id} className={level.id===levelId?'service-card selected':'service-card'} onClick={()=>setLevelId(level.id)}><span><strong>{level.name}</strong><small>{level.description || 'Serviço de entrega PegaJá'}</small></span><ChevronRight size={18}/></button>)}</div>
      {deliveryMode==='scheduled' && <>
        {scheduleLevels.length===0 ? <div className="notice">Nenhum serviço disponível para agendamento neste momento.</div> : <><div><p className="section-label">Escolhe o dia</p>{renderCalendar()}</div><div><p className="section-label">Escolhe a hora</p>{renderTimeWheel()}</div></>}
      </>}
      <div className="notice"><Clock3 size={18}/> O valor da entrega é calculado com base na rota e no serviço disponível.</div>
    </>}

    {step===4 && <>
      <div className="shipment-step-intro"><span className="shipment-step-number">5</span><div><p className="eyebrow">Confirmar</p><h1>Confirmar o teu envio</h1></div></div>
      <div className="summary-card">
        <SummaryRow label="Rota" value={`${pickup?.address_line || customPickup.address_line || 'Recolha'} → ${destination.address_line}`}/>
        <SummaryRow label="Destinatário" value={`${destination.contact_name} · ${destination.contact_phone}`}/>
        <SummaryRow label="Pacote" value={`${pkg.package_type} · ${pkg.description}`}/>
        <SummaryRow label="Serviço" value={selectedLevel?.name || '—'}/>
        {scheduledFor && <SummaryRow label="Agendado" value={new Date(scheduledFor).toLocaleString('pt-AO',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}/>}
        <SummaryRow label="Valor da entrega" value={money(quote?.total_amount,quote?.currency)} strong/>
      </div>
      <label>Pagamento<select value={payment} onChange={(e)=>setPayment(e.target.value as typeof payment)}>{paymentOptions.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Gorjeta<select value={gratuity} onChange={(e)=>setGratuity(e.target.value)}>{gratuityOptions.filter((option)=>option.value!=='custom').map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      {gratuity!=='0' && quote && <div className="tip-preview">Gorjeta: {money(quote.total_amount*(Number(gratuity)/100),quote.currency)}</div>}
      <div className="notice"><Check size={18}/> Tudo pronto. O envio só será criado depois de confirmares.</div>
    </>}

    {error && <div className="error">{error}</div>}
    <div className="flow-actions">
      {step>0 && <button className="secondary" type="button" onClick={()=>setStep((value)=>value-1)} disabled={busy}>Voltar</button>}
      <button className="primary" type="button" onClick={next} disabled={busy || !canContinue}>{busy?'A preparar…':step===4?'Confirmar envio':step===2?'Continuar':'Continuar'} <ChevronRight size={18}/></button>
    </div>
  </section>;
}
function AddressFields({ value, onChange, compact = false }: { value: StopInput; onChange: (field: keyof StopInput, value: string) => void; compact?: boolean }) {
  return <div className="stack">
    <label>Morada<input required value={value.address_line} onChange={(e)=>onChange('address_line',e.target.value)} placeholder="Rua, número, referência"/></label>
    <label>Localidade<input required value={value.locality} onChange={(e)=>onChange('locality',e.target.value)} placeholder="Bairro e Município"/></label>
    {!compact && <>
      <div className="two-col">
        <label>Quem recebe? Nome<input required value={value.contact_name} onChange={(e)=>onChange('contact_name',e.target.value)} placeholder="Nome do destinatário"/></label>
        <label>Telefone<input required value={value.contact_phone} onChange={(e)=>onChange('contact_phone',e.target.value)} placeholder="9XX XXX XXX"/></label>
      </div>
      <label>Telefone alternativo <span className="optional-label">(opcional)</span><input value={value.alternative_contact_phone} onChange={(e)=>onChange('alternative_contact_phone',e.target.value)} placeholder="9XX XXX XXX"/></label>
      <label>+ Adicionar instruções<input value={value.instructions} onChange={(e)=>onChange('instructions',e.target.value)} placeholder="Portão azul, 2.º andar, ligar ao chegar."/></label>
    </>}
  </div>;
}
function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="summary-row"><span>{label}</span><strong className={strong ? 'amount' : ''}>{value}</strong></div>; }

function ShipmentsTab({ refreshToken }: { refreshToken: number }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const load = async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase.from('deliveries').select('id,reference,status,quoted_amount,total_amount,currency,created_at,scheduled_for,service_level_id,delivery_stops(id,sequence_no,stop_type,address_line,locality,city,contact_name,completed_at),delivery_packages(id,description,package_type,fragile)').order('created_at', { ascending: false }).limit(100);
    setDeliveries((data as Delivery[]) || []);
    setError(queryError ? 'Não conseguimos carregar os teus envios agora. Tenta novamente daqui a pouco.' : '');
    setLoading(false);
  };
  useEffect(() => { void load(); }, [refreshToken]);
  useEffect(() => { const channel = supabase.channel('customer-delivery-events').on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_events' }, () => void load()).subscribe(); return () => { supabase.removeChannel(channel); }; }, []);
  const now = Date.now();
  const active = deliveries.filter((item) => ['dispatching','assigned','en_route_to_pickup','at_pickup','picked_up','in_transit','at_stop'].includes(item.status));
  const scheduled = deliveries.filter((item) => Boolean(item.scheduled_for) && new Date(item.scheduled_for!).getTime() > now && !['delivered','cancelled','failed','returned'].includes(item.status));
  const history = deliveries.filter((item) => !active.some((entry) => entry.id === item.id) && !scheduled.some((entry) => entry.id === item.id)).filter((item) => { const query = search.trim().toLowerCase(); if (!query) return true; return item.reference.toLowerCase().includes(query) || new Date(item.created_at).toLocaleDateString('pt-AO').includes(query); });
  const recent = history.slice(0, 3);
  const requestCancellation = async (delivery: Delivery) => {
    if (!window.confirm('Queres pedir o cancelamento deste envio?')) return;
    const { error: cancelError } = await supabase.rpc('request_delivery_cancellation', { p_delivery_id: delivery.id, p_reason_code: 'customer_request', p_reason: 'Cancelamento solicitado pelo cliente' });
    if (cancelError) setError('Não foi possível pedir o cancelamento agora. Tenta novamente.'); else await load();
  };
  return <section className="activities-page">
    <header className="activities-heading"><h1>Acompanha os teus envios</h1><button className="icon-button activities-refresh" onClick={() => void load()} aria-label="Actualizar"><RefreshCw size={18} className={loading ? 'spin' : ''} /></button></header>
    {error && <div className="error">{error}</div>}
    <section className="activities-section"><div className="activities-section-title">Em movimento</div>
      {loading && !deliveries.length ? <div className="inline-loading"><RefreshCw className="spin" size={20} /><span>A carregar os teus envios…</span></div> : active.length ? active.map((delivery) => <button className="activity-shipment-card" key={delivery.id} onClick={() => setSelected(delivery)}>
        <div className="activity-card-top"><span>{delivery.reference}</span><span className="activity-status"><i className="status-dot" />{statuses[delivery.status] || delivery.status}</span></div>
        <div className="activity-route"><strong>{delivery.delivery_stops?.[0]?.locality || delivery.delivery_stops?.[0]?.address_line || 'Recolha'}</strong><ChevronRight size={15} /><strong>{delivery.delivery_stops?.at(-1)?.locality || delivery.delivery_stops?.at(-1)?.address_line || 'Destino'}</strong></div>
        <div className="activity-card-bottom"><span>{delivery.scheduled_for ? ('Agendado · ' + new Date(delivery.scheduled_for).toLocaleString('pt-AO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })) : 'Acompanhar em tempo real'}</span><ChevronRight size={18} /></div>
      </button>) : <div className="activities-empty">Não tens nenhum envio em movimento.</div>}
    </section>
    <section className="activities-section"><div className="activities-section-title">Histórico</div>
      <label className="activities-search"><Search size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Procurar por data ou número do envio" aria-label="Procurar por data ou número do envio" /></label>
      <button className="history-entry" onClick={() => setHistoryOpen(true)}><span><strong>{recent.length} recentes</strong><span>Enviados</span></span><ChevronRight size={19} /></button>
      {historyOpen && <div className="history-list">{history.length ? history.map((delivery) => <button className="history-item" key={delivery.id} onClick={() => setSelected(delivery)}><div><strong>{delivery.reference}</strong><span>{delivery.delivery_stops?.[0]?.locality || delivery.delivery_stops?.[0]?.address_line || 'Recolha'} <ChevronRight size={13} /> {delivery.delivery_stops?.at(-1)?.locality || delivery.delivery_stops?.at(-1)?.address_line || 'Destino'}</span><small>{statuses[delivery.status] || delivery.status} · {new Date(delivery.created_at).toLocaleDateString('pt-AO')}</small></div><ChevronRight size={18} /></button>) : <div className="activities-empty">Nenhum envio corresponde à pesquisa.</div>}</div>}
    </section>
    <section className="activities-section"><div className="activities-section-title">Agendados</div>
      {scheduled.length ? scheduled.map((delivery) => <div className="scheduled-card" key={delivery.id}><button className="scheduled-main" onClick={() => setSelected(delivery)}><div><strong>{delivery.reference}</strong><span>{delivery.delivery_stops?.[0]?.locality || delivery.delivery_stops?.[0]?.address_line || 'Recolha'} <ChevronRight size={13} /> {delivery.delivery_stops?.at(-1)?.locality || delivery.delivery_stops?.at(-1)?.address_line || 'Destino'}</span><small>{new Date(delivery.scheduled_for!).toLocaleString('pt-AO', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div></button><div className="scheduled-actions"><button className="text-button" onClick={() => setSelected(delivery)}>Editar</button><button className="text-button danger-text" onClick={() => void requestCancellation(delivery)}>Cancelar</button></div></div>) : <div className="activities-empty">Não tens envios agendados.</div>}
    </section>
    {selected && <DeliveryDetail delivery={selected} onClose={() => setSelected(null)} />}
  </section>;
}function DeliveryDetail({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const pickup = delivery.delivery_stops?.[0];
  const destination = delivery.delivery_stops?.at(-1);
  const packageInfo = delivery.delivery_packages?.[0];

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="modal-sheet" role="dialog" aria-modal="true" aria-labelledby="delivery-detail-title">
      <div className="modal-header">
        <div>
          <p className="eyebrow">Envio</p>
          <h2 id="delivery-detail-title">{delivery.reference}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar detalhes">
          <X size={20} />
        </button>
      </div>

      <div className="status-banner">
        <span className="status-dot" />
        <span>Estado</span>
        <strong>{statuses[delivery.status] || delivery.status}</strong>
      </div>

      <div className="timeline">
        <div className="timeline-item">
          <span className="timeline-dot done" />
          <div><strong>Recolha</strong><p>{pickup?.address_line || 'Morada não disponível'}{pickup?.locality ? ` · ${pickup.locality}` : ''}</p></div>
        </div>
        <div className="timeline-item">
          <span className="timeline-dot event" />
          <div><strong>Destino</strong><p>{destination?.address_line || 'Morada não disponível'}{destination?.locality ? ` · ${destination.locality}` : ''}</p></div>
        </div>
      </div>

      {packageInfo && <div className="timeline">
        <div className="timeline-item">
          <span className="timeline-dot event" />
          <div><strong>Pacote</strong><p>{packageInfo.description || packageInfo.package_type || 'Pacote'}{packageInfo.fragile ? ' · Frágil' : ''}</p></div>
        </div>
      </div>}

      <div className="timeline">
        <div className="timeline-item">
          <span className="timeline-dot event" />
          <div><strong>Pagamento</strong><p>{money(delivery.total_amount ?? delivery.quoted_amount, delivery.currency || 'AOA')}</p></div>
        </div>
      </div>
    </section>
  </div>;
}

function NotificationsTab() { const [items, setItems] = useState<Notification[]>([]); const [error, setError] = useState(''); useEffect(() => { supabase.from('notifications').select('id,title,body,read_at,created_at,type').order('created_at', { ascending: false }).limit(100).then(({ data, error: queryError }) => { setItems(data || []); setError(queryError?.message || ''); }); }, []); return <section className="stack page-section"><div><p className="eyebrow">Acompanha o que importa</p><h1>Notificações</h1><p className="muted">Atualizações dos teus envios e da conta.</p></div>{error && <div className="error">{error}</div>}{items.map((item) => <div className={item.read_at ? 'notification' : 'notification unread'} key={item.id}><div className="round-icon terracotta"><Bell size={18} /></div><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString('pt-AO')}</small></div></div>)}{!items.length && !error && <EmptyState title="Sem notificações" body="Quando houver novidades, aparecem aqui." />}</section>; }

function ProfileTab({ user }: { user: AuthUser }) {
  const [profile, setProfile] = useState({ full_name: '', phone: '' });
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [wallet, setWallet] = useState<{ balance: number; currency: string; status: string } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState(user.email || '');
  const [editPhone, setEditPhone] = useState(user.phone || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPinInfo, setShowPinInfo] = useState(false);

  const load = async () => {
    const [{ data: profileData }, { data: addressData }, { data: walletData }, { count }] = await Promise.all([
      supabase.from('profiles').select('full_name,phone').eq('id', user.id).single(),
      supabase.from('addresses').select('id,label,address_line,locality,city,contact_name,contact_phone,instructions').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('wallet_accounts').select('balance,currency,status').eq('user_id', user.id).maybeSingle(),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null),
    ]);
    const nextProfile = { full_name: profileData?.full_name || user.user_metadata?.full_name || '', phone: profileData?.phone || user.phone || '' };
    setProfile(nextProfile);
    setEditName(nextProfile.full_name);
    setEditPhone(nextProfile.phone);
    setEditEmail(user.email || '');
    setAddresses((addressData as Address[]) || []);
    setWallet(walletData || null);
    setUnreadNotifications(count || 0);
  };

  useEffect(() => { void load(); }, [user.id]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const nextName = editName.trim();
    const nextEmail = editEmail.trim().toLowerCase();
    const nextPhone = normalizeAngolaPhone(editPhone);
    if (!nextName || !nextPhone) {
      setMessage('Preenche o nome e um número de telefone válido.');
      setBusy(false);
      return;
    }
    const { error: profileError } = await supabase.from('profiles').update({ full_name: nextName }).eq('id', user.id);
    if (profileError) {
      setMessage('Não conseguimos guardar os teus dados. Tenta novamente.');
      setBusy(false);
      return;
    }
    let feedback = 'Dados actualizados.';
    if (nextEmail && nextEmail !== (user.email || '').toLowerCase()) {
      const { error } = await supabase.auth.updateUser({ email: nextEmail });
      feedback = error ? 'Nome actualizado, mas não foi possível iniciar a verificação do novo email.' : 'Nome actualizado. Enviámos uma verificação para o novo email.';
    }
    if (nextPhone && nextPhone !== (user.phone || profile.phone)) {
      const { error } = await supabase.auth.updateUser({ phone: nextPhone });
      feedback += error ? ' Não foi possível iniciar a verificação do novo telefone.' : ' Enviámos um código para verificar o novo telefone.';
    }
    setMessage(feedback);
    setEditOpen(false);
    setBusy(false);
    await load();
  };

  const addressFor = (label: string) => addresses.find((item) => (item.label || '').toLowerCase() === label.toLowerCase());
  const identityPhone = user.phone || profile.phone;
  const emailVerified = Boolean(user.email && user.email_confirmed_at);
  const phoneVerified = Boolean(user.phone);
  const home = addressFor('Casa');
  const work = addressFor('Trabalho');
  const favoriteCount = addresses.filter((item) => !['casa', 'trabalho'].includes((item.label || '').toLowerCase())).length;

  return <section className="profile-page">
    <header className="profile-identity">
      <div className="profile-avatar"><User size={28} /></div>
      <div className="profile-identity-main">
        <h1>{profile.full_name || 'Cliente PegaJá'}</h1>
        <div className="profile-identity-line"><span className={phoneVerified ? 'verified' : ''}>{phoneVerified ? '✓ ' : ''}{identityPhone ? formatAngolaPhone(identityPhone) : 'Telefone não definido'}</span></div>
        {user.email && <div className="profile-identity-line"><span className={emailVerified ? 'verified' : ''}>{emailVerified ? '✓ ' : ''}{user.email}</span></div>}
      </div>
      <button className="icon-button profile-edit-button" onClick={() => setEditOpen(true)} aria-label="Editar perfil"><Pencil size={17} /></button>
    </header>
    {message && <div className="success profile-message">{message}</div>}

    <section className="profile-section">
      <div className="profile-section-heading"><h2>Dados pessoais</h2><button className="text-button" onClick={() => setEditOpen(true)}>Editar <ChevronRight size={15} /></button></div>
      <div className="profile-list">
        <div className="profile-row"><User size={18} /><div><small>Nome</small><strong>{profile.full_name || '—'}</strong></div></div>
        <div className="profile-row"><Phone size={18} /><div><small>Telefone</small><strong>{identityPhone ? formatAngolaPhone(identityPhone) : '—'}</strong></div></div>
        <div className="profile-row"><Mail size={18} /><div><small>Email</small><strong>{user.email || '—'}</strong></div></div>
      </div>
    </section>

    <section className="profile-section">
      <div className="profile-section-heading"><h2>Endereços</h2></div>
      <div className="profile-list">
        <div className="profile-row profile-row-action"><Home size={18} /><div><small>Casa</small><strong>{home?.address_line || 'Adicionar endereço'}</strong></div><ChevronRight size={17} /></div>
        <div className="profile-row profile-row-action"><Briefcase size={18} /><div><small>Trabalho</small><strong>{work?.address_line || 'Adicionar endereço'}</strong></div><ChevronRight size={17} /></div>
        <div className="profile-row profile-row-action"><Star size={18} /><div><small>Favoritos</small><strong>{favoriteCount ? 'Endereços guardados' : 'Nenhum favorito ainda'}</strong></div><ChevronRight size={17} /></div>
        <button className="profile-add-row"><Plus size={18} /><span>Adicionar endereço</span></button>
      </div>
    </section>

    <section className="profile-section">
      <div className="profile-section-heading"><h2>Pagamentos</h2></div>
      <div className="profile-payment-list">
        <div className="profile-payment"><HandCoins size={20} /><strong>Dinheiro</strong></div>
        <div className="profile-payment"><WalletCards size={20} /><strong>Multicaixa</strong></div>
        <div className="profile-payment"><WalletCards size={20} /><strong>Carteira</strong></div>
      </div>
    </section>

    <section className="profile-section">
      <div className="profile-section-heading"><h2>Notificações & Preferências</h2></div>
      <div className="profile-list">
        <div className="profile-row profile-row-action"><Bell size={18} /><div><small>Notificações</small><strong>{unreadNotifications ? `${unreadNotifications} por ler` : 'Tudo em dia'}</strong></div><ChevronRight size={17} /></div>
        <div className="profile-row"><Settings size={18} /><div><small>Promoções</small><strong>0</strong></div></div>
        <div className="profile-row"><ShieldCheck size={18} /><div><small>Segurança e conta</small><strong>0</strong></div></div>
        <div className="profile-row"><Send size={18} /><div><small>Envios concluídos</small><strong>0</strong></div></div>
        <div className="profile-row"><RefreshCw size={18} /><div><small>Actualização da aplicação</small><strong>0</strong></div></div>
      </div>
      <div className="profile-subheading">Tema</div>
      <div className="profile-theme-grid">
        <button className="profile-theme selected"><Sun size={17} /><span>Claro</span></button>
        <button className="profile-theme" disabled><Moon size={17} /><span>Escuro</span></button>
        <button className="profile-theme" disabled><Smartphone size={17} /><span>Automático</span></button>
      </div>
    </section>

    <section className="profile-section">
      <div className="profile-section-heading"><h2>Segurança e ajustes</h2></div>
      <div className="profile-list">
        <div className="profile-row"><LockKeyhole size={18} /><div><small>Bloqueio da aplicação</small><strong>Disponível em breve</strong></div></div>
        <button className="profile-row profile-row-action" onClick={() => setShowPinInfo((value) => !value)}><ShieldCheck size={18} /><div><small>PIN do destinatário</small><strong>Segurança da entrega</strong></div><ChevronRight size={17} /></button>
        {showPinInfo && <div className="profile-inline-info">O PIN do destinatário é usado para confirmar a entrega. A geração e verificação do PIN são geridas pelo serviço de entregas.</div>}
      </div>
    </section>

    <section className="profile-section">
      <div className="profile-section-heading"><h2>Ajuda</h2></div>
      <div className="profile-help-group"><strong>PegaJá</strong>
        <button className="profile-row profile-row-action"><MessageCircle size={18} /><div><span>Pergunta à Paula</span></div><ChevronRight size={17} /></button>
        <button className="profile-row profile-row-action"><MessageCircle size={18} /><div><span>Linha de suporte</span></div><ChevronRight size={17} /></button>
        <a className="profile-row profile-row-action" href="https://wa.me/244958316486" target="_blank" rel="noreferrer"><MessageCircle size={18} /><div><span>WhatsApp</span></div><ChevronRight size={17} /></a>
      </div>
      <div className="profile-help-group emergency-group"><strong>Emergência</strong>
        <a className="profile-row profile-row-action emergency-row" href="tel:112"><Phone size={18} /><div><span>112&nbsp; Ambulância</span></div><ChevronRight size={17} /></a>
        <a className="profile-row profile-row-action emergency-row" href="tel:118"><Phone size={18} /><div><span>118&nbsp; Bombeiros</span></div><ChevronRight size={17} /></a>
        <a className="profile-row profile-row-action emergency-row" href="tel:110"><Phone size={18} /><div><span>110&nbsp; Polícia</span></div><ChevronRight size={17} /></a>
      </div>
    </section>

    <section className="profile-section profile-account-section">
      <div className="profile-section-heading"><h2>Legal</h2></div>
      <div className="profile-list">
        <button className="profile-row profile-row-action"><FileText size={18} /><div><span>Termos de Uso</span></div><ChevronRight size={17} /></button>
        <button className="profile-row profile-row-action"><FileText size={18} /><div><span>Política de Privacidade</span></div><ChevronRight size={17} /></button>
        <button className="profile-row profile-row-action"><FileText size={18} /><div><span>Política de Reembolso</span></div><ChevronRight size={17} /></button>
      </div>
      <div className="profile-app-version">Aplicação · v0.1.0</div>
      <button className="profile-row profile-logout" onClick={() => void supabase.auth.signOut()}><LogOut size={18} /><span>Terminar sessão</span></button>
      <button className="profile-delete" disabled><Trash2 size={17} /><span>Eliminar conta</span></button>
    </section>

    {editOpen && <div className="modal-backdrop"><div className="modal-sheet profile-edit-sheet">
      <div className="modal-header"><div><p className="eyebrow">Dados pessoais</p><h2>Editar perfil</h2></div><button className="icon-button" onClick={() => setEditOpen(false)} aria-label="Fechar"><X size={20} /></button></div>
      <form className="stack" onSubmit={saveProfile}>
        <label>Nome<input value={editName} onChange={(e) => setEditName(e.target.value)} autoComplete="name" /></label>
        <label>Telefone<input value={editPhone.replace(/^\\+244/, '')} onChange={(e) => setEditPhone(e.target.value)} inputMode="numeric" autoComplete="tel-national" placeholder="9XX XXX XXX" /></label>
        <label>Email<input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} type="email" autoComplete="email" /></label>
        <div className="profile-verification-note"><ShieldCheck size={17} /> Alterações de telefone e email exigem verificação.</div>
        <button className="primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar alterações'}</button>
      </form>
    </div></div>}
  </section>;
}

function PaulaModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ from: 'paula' | 'customer'; text: string }>>([
    { from: 'paula', text: 'Olá! Sou a Paula. Posso ajudar-te com dúvidas sobre os envios, pagamentos, endereços e como usar a aplicação.' },
  ]);

  const reply = (input: string) => {
    const text = input.trim();
    if (!text) return;
    const normalized = text.toLowerCase();
    let answer = 'Não tenho informação suficiente para responder a isso. Por favor, contacta o suporte.';

    if (/^(olá|ola|oi|bom dia|boa tarde|boa noite|hey|hello)\\b/.test(normalized) || normalized === 'paula') {
      answer = 'Olá! Como posso ajudar?';
    } else if (/(como|onde).*(enviar|envio)|novo envio|mandar.*pacote|enviar.*pacote/.test(normalized)) {
      answer = 'Para fazer um envio, toca em “Novo envio” no ecrã Enviar e segue os passos para indicar a recolha, o destino, o pacote, o serviço e o pagamento.';
    } else if (/(acompanhar|acompanho|seguir|rastrear|rastreio|onde.*envio|estado.*envio)/.test(normalized)) {
      answer = 'Podes acompanhar os teus envios em “Atividades”. Quando tiveres um envio em andamento, o estado também aparece no ecrã Enviar.';
    } else if (/(histórico|historico|envios antigos|envio anterior)/.test(normalized)) {
      answer = 'Os teus envios anteriores ficam em “Atividades”. O histórico começa a aparecer depois do teu primeiro envio.';
    } else if (/(pagamento|pagar|dinheiro|carteira)/.test(normalized)) {
      answer = 'No momento do envio, escolhes a forma de pagamento disponível para a tua conta. O valor é apresentado antes de confirmares o envio.';
    } else if (/(preço|preco|quanto custa|cotação|cotacao|valor)/.test(normalized)) {
      answer = 'O preço depende dos detalhes do envio. Depois de indicares a rota, o pacote e o serviço, a aplicação mostra a cotação antes da confirmação.';
    } else if (/(endereço|endereco|morada|local de recolha|localização|localizacao)/.test(normalized)) {
      answer = 'Podes guardar os teus endereços no teu Perfil e usar um deles como local de recolha quando criares um envio.';
    } else if (/(cancelar|cancelamento)/.test(normalized)) {
      answer = 'Se precisares de cancelar um envio, abre os detalhes do envio em “Atividades” e verifica as opções disponíveis para esse envio.';
    } else if (/(suporte|ajuda|falar com alguém|falar com alguem)/.test(normalized)) {
      answer = 'Se a tua dúvida não estiver dentro do que consigo explicar, contacta o suporte. A equipa de suporte trata dos casos que precisam de atendimento humano.';
    }

    setMessages((current) => [...current, { from: 'customer', text }, { from: 'paula', text: answer }]);
    setMessage('');
  };

  return <div className="modal-backdrop"><div className="modal-sheet paula">
    <div className="modal-header"><div className="paula-avatar">🙎🏾‍♀️</div><div><p className="eyebrow">Paula</p><h2>Como posso ajudar?</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar Paula"><X size={20} /></button></div>
    <div className="paula-chat">{messages.map((item, index) => <div key={index} className={item.from === 'paula' ? 'paula-message' : 'customer-message'}>{item.text}</div>)}</div>
    <form className="paula-input" onSubmit={(event) => { event.preventDefault(); reply(message); }}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Pergunta à Paula…" aria-label="Pergunta à Paula" /><button className="primary" type="submit">Enviar</button></form>
  </div></div>;
}
function EmptyState({ title, body }: { title: string; body: string }) { return <div className="empty"><FileText size={30} /><strong>{title}</strong><p>{body}</p></div>; }
function FullPage({ message, inline = false }: { message: string; inline?: boolean }) { return <div className={inline ? 'inline-loading' : 'full-page'}><RefreshCw className="spin" size={22} /><span>{message}</span></div>; }

export default App;
