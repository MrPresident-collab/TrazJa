import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './lib/supabase';
import { Camera, Check, ChevronRight, CircleHelp, Clock3, FileText, LogOut, MapPin, Package, Plus, RefreshCw, Send, User, X } from 'lucide-react';
import type { Session, User as AuthUser } from '@supabase/supabase-js';

type Address = { id: string; label: string | null; address_line: string; locality: string | null; city: string | null; contact_name: string | null; contact_phone: string | null; instructions: string | null };
type ServiceLevel = { id: string; code: string; name: string; description: string | null; promised_minutes: number | null; same_day: boolean; scheduling_supported: boolean };
type StopInput = { address_line: string; locality: string; city: string; contact_name: string; contact_phone: string; instructions: string };
type Delivery = { id: string; reference: string; status: string; quoted_amount: number | null; total_amount: number | null; currency: string; created_at: string; scheduled_for: string | null; service_level_id: string | null; delivery_stops: Array<{ id: string; sequence_no: number; stop_type: string; address_line: string; locality: string | null; city: string | null; contact_name: string | null; completed_at: string | null }>; delivery_packages: Array<{ id: string; description: string | null; package_type: string | null; fragile: boolean }> };
type Notification = { id: string; title: string; body: string | null; read_at: string | null; created_at: string; type: string };
type Draft = { id: string; reference: string; status: string };
type Quote = { id: string; total_amount: number; subtotal_amount: number; gratuity_amount: number; currency: string; valid_until: string | null };

const paymentOptions = [
  { value: 'wallet', label: 'Carteira PegaJá' },
  { value: 'cash', label: 'Dinheiro' },
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
  const [tab, setTab] = useState<'send' | 'activities' | 'profile'>('send'); const [refreshToken, setRefreshToken] = useState(0); const [paulaOpen, setPaulaOpen] = useState(false);
  return <div className="app-shell"><main className="page-content">{tab === 'send' && <HomeTab user={user} onCreated={() => { setRefreshToken((n) => n + 1); setTab('activities'); }} onOpenPaula={() => setPaulaOpen(true)} />}{tab === 'activities' && <ShipmentsTab refreshToken={refreshToken} />}{tab === 'profile' && <ProfileTab user={user} />}</main><nav className="bottom-nav" aria-label="Navegação principal"><NavButton active={tab === 'send'} icon={<Send size={20} />} label="Enviar" onClick={() => setTab('send')} /><NavButton active={tab === 'activities'} icon={<RefreshCw size={20} />} label="Atividades" onClick={() => setTab('activities')} /><NavButton active={tab === 'profile'} icon={<User size={20} />} label="Perfil" onClick={() => setTab('profile')} /></nav>{paulaOpen && <PaulaModal onClose={() => setPaulaOpen(false)} user={user} />}</div>;
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
      supabase.from('service_levels').select('id,code,name,description,promised_minutes,same_day,scheduling_supported').eq('active', true).order('sort_order').limit(30),
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
  const [step, setStep] = useState(0); const [pickupId, setPickupId] = useState(addresses[0]?.id || ''); const [newPickup, setNewPickup] = useState({ address_line: '', locality: '', city: 'Luanda', contact_name: '', contact_phone: '', instructions: '' }); const [destination, setDestination] = useState({ address_line: '', locality: '', city: '', contact_name: '', contact_phone: '', instructions: '' }); const [stops, setStops] = useState<Array<typeof destination>>([]); const [pkg, setPkg] = useState({ package_type: '', package_size: '', description: '', weight_kg: '', declared_value: '', fragile: false }); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState(''); const [levelId, setLevelId] = useState(levels[0]?.id || ''); const [scheduledFor, setScheduledFor] = useState(''); const [quote, setQuote] = useState<Quote | null>(null); const [draft, setDraft] = useState<Draft | null>(null); const [payment, setPayment] = useState<(typeof paymentOptions)[number]['value']>('cash'); const [gratuity, setGratuity] = useState('0'); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const cameraRef = useRef<HTMLInputElement>(null);
  const selectedLevel = levels.find((item) => item.id === levelId); const pickup = addresses.find((address) => address.id === pickupId);
  const canContinue = step === 0 ? Boolean((pickupId || (newPickup.address_line && newPickup.locality && newPickup.contact_name && newPickup.contact_phone)) && destination.address_line && destination.contact_name && destination.contact_phone && stops.every((stop) => stop.address_line && stop.contact_name && stop.contact_phone)) : step === 1 ? Boolean(pkg.package_type && pkg.package_size && pkg.description && file) : step === 2 ? Boolean(levelId) : Boolean(quote && payment);
  const handleFile = (next: File | null) => { if (!next) return; if (!['image/jpeg', 'image/webp'].includes(next.type)) { setError('A evidência deve ser JPEG ou WebP.'); return; } setFile(next); setPreview(URL.createObjectURL(next)); setError(''); };
  const addStop = () => setStops((current) => [...current, { address_line: '', locality: '', city: '', contact_name: '', contact_phone: '', instructions: '' }]);
  const updateStop = (index: number, field: keyof typeof destination, value: string) => setStops((current) => current.map((stop, i) => i === index ? { ...stop, [field]: value } : stop));
  const prepareQuote = async () => { setBusy(true); setError(''); try { const { data: draftData, error: draftError } = await supabase.rpc('create_delivery_draft', { p_idempotency_key: idempotency(), p_service_level_id: levelId, p_scheduled_for: scheduledFor ? new Date(scheduledFor).toISOString() : null, p_notes: destination.instructions || null }); if (draftError) throw draftError; const created = unwrap<Draft>(draftData); if (!created) throw new Error('Não conseguimos preparar o envio. Tenta novamente.'); setDraft(created); const stopRows = [{ delivery_id: created.id, sequence_no: 1, stop_type: 'pickup', address_id: pickup?.id || null, address_line: pickup?.address_line || '', locality: pickup?.locality || null, city: pickup?.city || null, contact_name: pickup?.contact_name || null, contact_phone: pickup?.contact_phone || null, instructions: pickup?.instructions || null }, ...stops.map((stop, index) => ({ delivery_id: created.id, sequence_no: index + 2, stop_type: 'waypoint', address_id: null, address_line: stop.address_line, locality: stop.locality || null, city: stop.city || null, contact_name: stop.contact_name, contact_phone: stop.contact_phone, instructions: stop.instructions || null })), { delivery_id: created.id, sequence_no: stops.length + 2, stop_type: 'dropoff', address_id: null, address_line: destination.address_line, locality: destination.locality || null, city: destination.city || null, contact_name: destination.contact_name, contact_phone: destination.contact_phone, instructions: destination.instructions || null }]; const { data: stopData, error: stopError } = await supabase.from('delivery_stops').insert(stopRows).select('id,sequence_no,stop_type').order('sequence_no'); if (stopError) throw stopError; const { data: packageData, error: packageError } = await supabase.from('delivery_packages').insert({ delivery_id: created.id, package_type: pkg.package_type, metadata: { package_size: pkg.package_size }, description: pkg.description, weight_kg: pkg.weight_kg ? Number(pkg.weight_kg) : null, declared_value: pkg.declared_value ? Number(pkg.declared_value) : null, fragile: pkg.fragile }).select('id').single(); if (packageError) throw packageError; const extension = file!.type === 'image/webp' ? 'webp' : 'jpg'; const objectPath = `${created.id}/${packageData.id}/${crypto.randomUUID()}.${extension}`; const { error: uploadError } = await supabase.storage.from('delivery-evidence').upload(objectPath, file!, { contentType: file!.type, upsert: false }); if (uploadError) throw uploadError; const { error: evidenceError } = await supabase.from('delivery_evidence').insert({ delivery_id: created.id, package_id: packageData.id, stop_id: stopData?.[0]?.id || null, bucket_id: 'delivery-evidence', object_path: objectPath, evidence_type: 'customer_package_photo', captured_by: user.id, metadata: { source: 'camera_capture_required', content_type: file!.type } }); if (evidenceError) throw evidenceError; const { data: quoteData, error: quoteError } = await supabase.rpc('calculate_delivery_quote', { p_delivery_id: created.id, p_service_level_id: levelId }); if (quoteError) throw quoteError; const nextQuote = unwrap<Quote>(quoteData); if (!nextQuote) throw new Error('Não conseguimos calcular o valor agora. Tenta novamente.'); setQuote(nextQuote); setStep(3); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível preparar o envio.'); } finally { setBusy(false); } };
  const confirm = async () => { if (!draft || !quote) return; setBusy(true); setError(''); const { error: confirmError } = await supabase.rpc('confirm_delivery', { p_delivery_id: draft.id, p_payment_method: payment, p_gratuity_amount: 0 }); if (confirmError) setError(confirmError.message); else onCreated(); setBusy(false); };
  const next = async () => {
    if (step === 0 && !pickupId) {
      setBusy(true); setError('');
      const { data, error: addressError } = await supabase.from('addresses').insert({
        user_id: user.id,
        label: 'Recolha',
        address_line: newPickup.address_line.trim(),
        locality: newPickup.locality.trim(),
        city: newPickup.city.trim() || null,
        contact_name: newPickup.contact_name.trim(),
        contact_phone: newPickup.contact_phone.trim(),
        instructions: newPickup.instructions.trim() || null,
      }).select('id,label,address_line,locality,city,contact_name,contact_phone,instructions').single();
      setBusy(false);
      if (addressError || !data) { setError(addressError?.message || 'Não foi possível guardar o local de recolha.'); return; }
      setAddresses((current) => [data as Address, ...current]);
      setPickupId(data.id);
    }
    if (step === 2) prepareQuote(); else if (step < 3) setStep((value) => value + 1); else confirm();
  };
  return <section className="stack page-section"><div className="flow-heading"><button className="text-button" onClick={onCancel}><X size={18} /> Cancelar</button><span>Passo {step + 1} de 4</span></div><div className="progress"><span style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>{step === 0 && <><div><p className="eyebrow">Novo envio</p><h1>Recolha e destino</h1><p className="muted">Indica onde vamos recolher e para onde vamos levar o pacote.</p></div><label>Onde recolher<select value={pickupId} onChange={(e) => setPickupId(e.target.value)}><option value="">Escolhe um endereço guardado</option>{addresses.map((address) => <option key={address.id} value={address.id}>{address.label || address.address_line}</option>)}</select></label>{pickup ? <div className="selected-address"><MapPin size={18} /><span>{pickup.address_line}{pickup.city ? `, ${pickup.city}` : ''}</span></div> : <div className="stack visitor-pickup"><div className="notice">Ainda não tens um endereço guardado. Define o local de recolha para continuar.</div><AddressFields value={newPickup} onChange={(field, value) => setNewPickup((current) => ({ ...current, [field]: value }))} /></div>}<div className="section-heading"><h2>Destino final</h2><span>obrigatório</span></div><AddressFields value={destination} onChange={(field, value) => setDestination((current) => ({ ...current, [field]: value }))} /><div className="section-heading"><h2>Paragens intermédias</h2><button className="text-button" onClick={addStop}><Plus size={16} /> Adicionar</button></div>{stops.map((stop, index) => <div className="stop-card" key={index}><div className="stop-title"><strong>Paragem {index + 1}</strong><button className="icon-button small" onClick={() => setStops((current) => current.filter((_, i) => i !== index))}><X size={15} /></button></div><AddressFields value={stop} onChange={(field, value) => updateStop(index, field, value)} compact /></div>)}</>}{step === 1 && <><div><p className="eyebrow">O pacote</p><h1>O que vais enviar?</h1><p className="muted">A fotografia é evidência do pacote, não é prova de entrega.</p></div><div className="choice-grid">{['Documento', 'Pequeno pacote', 'Caixa', 'Encomenda', 'Outro'].map((type) => <button key={type} className={pkg.package_type === type ? 'choice selected' : 'choice'} onClick={() => setPkg({ ...pkg, package_type: type })}><Package size={19} />{type}</button>)}<div className="section-heading"><h2>Tamanho</h2></div>{['Pequeno', 'Médio', 'Grande'].map((size) => <button key={size} className={pkg.package_size === size ? 'choice selected' : 'choice'} onClick={() => setPkg({ ...pkg, package_size: size })}><Package size={19} />{size}</button>)}</div><label>Descrição<input value={pkg.description} onChange={(e) => setPkg({ ...pkg, description: e.target.value })} placeholder="Ex.: documentos numa pasta azul" /></label><div className="two-col"><label>Peso (kg)<input type="number" min="0" step="0.1" value={pkg.weight_kg} onChange={(e) => setPkg({ ...pkg, weight_kg: e.target.value })} /></label><label>Valor declarado<input type="number" min="0" step="1" value={pkg.declared_value} onChange={(e) => setPkg({ ...pkg, declared_value: e.target.value })} /></label></div><label className="check-row"><input type="checkbox" checked={pkg.fragile} onChange={(e) => setPkg({ ...pkg, fragile: e.target.checked })} /> É frágil</label><div className="evidence-box">{preview ? <img src={preview} alt="Pré-visualização da evidência do pacote" /> : <><Camera size={30} /><strong>Fotografia do pacote</strong><small>JPEG ou WebP · até 10 MB</small></>}<input ref={cameraRef} type="file" accept="image/jpeg,image/webp" capture="environment" onChange={(e) => handleFile(e.target.files?.[0] || null)} /><button className="secondary" onClick={() => cameraRef.current?.click()}>{preview ? 'Repetir fotografia' : 'Abrir câmara'}</button></div></>}{step === 2 && <><div><p className="eyebrow">Opção de entrega</p><h1>Escolhe o ritmo</h1><p className="muted">Escolhe a opção que combina melhor com o que precisas.</p></div><div className="stack">{levels.map((level) => <button key={level.id} className={level.id === levelId ? 'service-card selected' : 'service-card'} onClick={() => setLevelId(level.id)}><span><strong>{level.name}</strong><small>{level.description || 'Serviço de entrega PegaJá'}{level.promised_minutes ? ` · até ${level.promised_minutes} min` : ''}</small></span><ChevronRight size={18} /></button>)}</div>{selectedLevel?.scheduling_supported && <label>Agendar recolha<input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} /></label>}<div className="notice"><Clock3 size={18} /> Mostramos o valor depois de confirmares a rota e a opção de entrega.</div></>}{step === 3 && <><div><p className="eyebrow">Rever e confirmar</p><h1>Está tudo certo?</h1><p className="muted">Revê os detalhes antes de confirmar o teu envio.</p></div><div className="summary-card"><SummaryRow label="Rota" value={`${pickup?.address_line || 'Recolha'} → ${destination.address_line}`} /><SummaryRow label="Pacote" value={`${pkg.package_type} · ${pkg.package_size}: ${pkg.description}`} /><SummaryRow label="Serviço" value={selectedLevel?.name || '—'} /><SummaryRow label="Valor" value={money(quote?.total_amount, quote?.currency)} strong /></div><label>Pagamento<select value={payment} onChange={(e) => setPayment(e.target.value as typeof payment)}>{paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Gratificação do estafeta<select value={gratuity} onChange={(e) => setGratuity(e.target.value)}>{gratuityOptions.filter((option) => option.value !== 'custom').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="notice"><Check size={18} /> Vamos confirmar os detalhes e o pagamento antes de concluir o envio.</div></>}{error && <div className="error">{error}</div>}<div className="flow-actions">{step > 0 && <button className="secondary" onClick={() => setStep((value) => value - 1)} disabled={busy}>Voltar</button>}<button className="primary" onClick={next} disabled={busy || !canContinue}>{busy ? 'A validar…' : step === 3 ? 'Confirmar envio' : step === 2 ? 'Calcular cotação' : 'Continuar'} <ChevronRight size={18} /></button></div></section>;
}
function AddressFields({ value, onChange, compact = false }: { value: StopInput; onChange: (field: keyof StopInput, value: string) => void; compact?: boolean }) { return <div className="stack"><label>Morada<input required value={value.address_line} onChange={(e) => onChange('address_line', e.target.value)} placeholder="Rua, número e referência" /></label><div className="two-col"><label>Localidade<input value={value.locality} onChange={(e) => onChange('locality', e.target.value)} /></label><label>Cidade<input value={value.city} onChange={(e) => onChange('city', e.target.value)} /></label></div><div className="two-col"><label>Nome do destinatário<input required value={value.contact_name} onChange={(e) => onChange('contact_name', e.target.value)} /></label><label>Telefone<input required value={value.contact_phone} onChange={(e) => onChange('contact_phone', e.target.value)} /></label></div>{!compact && <label>Instruções<input value={value.instructions} onChange={(e) => onChange('instructions', e.target.value)} placeholder="Portaria, andar, referência…" /></label>}</div>; }
function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className="summary-row"><span>{label}</span><strong className={strong ? 'amount' : ''}>{value}</strong></div>; }

function ShipmentsTab({ refreshToken }: { refreshToken: number }) { const [deliveries, setDeliveries] = useState<Delivery[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [selected, setSelected] = useState<Delivery | null>(null); const load = async () => { setLoading(true); const { data, error: queryError } = await supabase.from('deliveries').select('id,reference,status,quoted_amount,total_amount,currency,created_at,scheduled_for,service_level_id,delivery_stops(id,sequence_no,stop_type,address_line,locality,city,contact_name,completed_at),delivery_packages(id,description,package_type,fragile)').order('created_at', { ascending: false }).limit(100); setDeliveries((data as Delivery[]) || []); setError(queryError ? 'Não conseguimos carregar os teus envios agora. Tenta novamente daqui a pouco.' : ''); setLoading(false); }; useEffect(() => { load(); }, [refreshToken]); useEffect(() => { const channel = supabase.channel('customer-delivery-events').on('postgres_changes', { event: '*', schema: 'public', table: 'delivery_events' }, () => load()).subscribe(); return () => { supabase.removeChannel(channel); }; }, []); const groups = useMemo(() => { const now = Date.now(); const buckets: Record<string, Delivery[]> = { Hoje: [], Ontem: [], 'Esta semana': [], 'Este mês': [], 'Mais antigos': [] }; deliveries.forEach((item) => { const hours = (now - new Date(item.created_at).getTime()) / 36e5; const bucket = hours < 24 ? 'Hoje' : hours < 168 ? 'Ontem' : hours < 600 ? 'Esta semana' : hours < 720 ? 'Este mês' : 'Mais antigos'; buckets[bucket].push(item); }); return buckets; }, [deliveries]); return <section className="stack page-section"><div className="section-heading"><div><h1>Atividades</h1><p className="muted">Aqui encontras os teus envios e o que aconteceu com eles.</p></div><button className="icon-button" onClick={load} aria-label="Actualizar"><RefreshCw size={19} className={loading ? 'spin' : ''} /></button></div>{error && <div className="error">{error}</div>}{loading && !deliveries.length ? <FullPage message="A carregar os teus envios…" inline /> : Object.entries(groups).map(([name, items]) => items.length ? <div className="stack" key={name}><div className="group-label">{name}</div>{items.map((delivery) => <button className="delivery-card" key={delivery.id} onClick={() => setSelected(delivery)}><div className="delivery-icon"><Send size={18} /></div><div className="delivery-main"><strong>{delivery.reference}</strong><span>{delivery.delivery_stops?.[0]?.address_line || 'Recolha'} <ChevronRight size={14} /> {delivery.delivery_stops?.at(-1)?.address_line || 'Destino'}</span><small>{statuses[delivery.status] || delivery.status} · {money(delivery.total_amount ?? delivery.quoted_amount, delivery.currency)}</small></div><ChevronRight size={18} /></button>)}</div> : null)}{!loading && !deliveries.length && <EmptyState title="Ainda não tens histórico" body="Faz o teu primeiro envio e os teus envios aparecerão aqui." />}{selected && <DeliveryDetail delivery={selected} onClose={() => setSelected(null)} />}</section>; }
function DeliveryDetail({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) { const [events, setEvents] = useState<Array<{ id: number; event_type: string; to_status: string | null; created_at: string }>>([]); useEffect(() => { supabase.from('delivery_events').select('id,event_type,to_status,created_at').eq('delivery_id', delivery.id).order('created_at', { ascending: false }).limit(50).then(({ data }) => setEvents(data || [])); }, [delivery.id]); return <div className="modal-backdrop"><div className="modal-sheet"><div className="modal-header"><div><p className="eyebrow">Envio</p><h2>{delivery.reference}</h2></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div><div className="status-banner"><span className="status-dot" />{statuses[delivery.status] || delivery.status}<strong>{money(delivery.total_amount ?? delivery.quoted_amount, delivery.currency)}</strong></div><div className="timeline"><h3>Rota e eventos</h3>{delivery.delivery_stops?.sort((a, b) => a.sequence_no - b.sequence_no).map((stop) => <div className="timeline-item" key={stop.id}><span className={stop.completed_at ? 'timeline-dot done' : 'timeline-dot'} /> <div><strong>{stop.stop_type === 'pickup' ? 'Recolha' : stop.stop_type === 'dropoff' ? 'Destino' : 'Paragem'}</strong><p>{stop.address_line}{stop.contact_name ? ` · ${stop.contact_name}` : ''}</p></div></div>)}{events.map((event) => <div className="timeline-item" key={event.id}><span className="timeline-dot event" /><div><strong>{event.to_status ? statuses[event.to_status] || event.to_status : event.event_type}</strong><p>{new Date(event.created_at).toLocaleString('pt-AO')}</p></div></div>)}</div></div></div>; }

function NotificationsTab() { const [items, setItems] = useState<Notification[]>([]); const [error, setError] = useState(''); useEffect(() => { supabase.from('notifications').select('id,title,body,read_at,created_at,type').order('created_at', { ascending: false }).limit(100).then(({ data, error: queryError }) => { setItems(data || []); setError(queryError?.message || ''); }); }, []); return <section className="stack page-section"><div><p className="eyebrow">Acompanha o que importa</p><h1>Notificações</h1><p className="muted">Atualizações dos teus envios e da conta.</p></div>{error && <div className="error">{error}</div>}{items.map((item) => <div className={item.read_at ? 'notification' : 'notification unread'} key={item.id}><div className="round-icon terracotta"><Bell size={18} /></div><div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString('pt-AO')}</small></div></div>)}{!items.length && !error && <EmptyState title="Sem notificações" body="Quando houver novidades, aparecem aqui." />}</section>; }

function ProfileTab({ user }: { user: AuthUser }) { const [profile, setProfile] = useState({ full_name: '', phone: '' }); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); useEffect(() => { supabase.from('profiles').select('full_name,phone').eq('id', user.id).single().then(({ data }) => setProfile({ full_name: data?.full_name || user.user_metadata?.full_name || '', phone: data?.phone || '' })); }, [user]); const save = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setMessage(''); const { error } = await supabase.from('profiles').update(profile).eq('id', user.id); setMessage(error ? 'Não conseguimos guardar as alterações. Tenta novamente.' : 'Perfil actualizado.'); setBusy(false); }; return <section className="stack page-section"><div><p className="eyebrow">A tua conta</p><h1>Perfil</h1><p className="muted">Mantém os teus dados de contacto sempre actualizados.</p></div><form onSubmit={save} className="stack surface-card"><label>Nome<input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} /></label><label>Telefone<input value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></label><label>Email<input value={user.email || ''} disabled /></label>{message && <div className={message === 'Perfil actualizado.' ? 'success' : 'error'}>{message}</div>}<button className="primary" disabled={busy}>{busy ? 'A guardar…' : 'Guardar alterações'}</button></form><button className="secondary danger" onClick={() => supabase.auth.signOut()}><LogOut size={18} /> Sair</button></section>; }

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
