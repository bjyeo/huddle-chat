import { useId, useState } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { useServerMeta } from '../hooks/useServerMeta.js';
import { DISPLAY_NAME_MAX, validateRegistration } from '../lib/validation.js';
import { LogoIcon } from './icons.jsx';

const EMPTY = { username: '', password: '', displayName: '', inviteCode: '' };

function Field({ label, hint, optional, ...inputProps }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label} {optional && <span className="field__optional">(optional)</span>}
      </label>
      <input
        id={id}
        className="input"
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...inputProps}
      />
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
    </div>
  );
}

export function AuthScreen() {
  const { login, register } = useAuth();
  const { maxUsers, inviteRequired } = useServerMeta();
  const [mode, setMode] = useState('login');
  const [fields, setFields] = useState(EMPTY);
  const isRegister = mode === 'register';
  const { run, pending, error, setError } = useAsyncAction(isRegister ? register : login);

  const bind = (name) => ({
    name,
    value: fields[name],
    onChange: (e) => setFields((f) => ({ ...f, [name]: e.target.value })),
  });

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setError(null);
  };

  const submit = (event) => {
    event.preventDefault();
    const username = fields.username.trim();
    if (!isRegister) {
      if (!username || !fields.password) return setError('Enter your username and password.');
      return run({ username, password: fields.password });
    }

    const problem = validateRegistration({ ...fields, username });
    if (problem) return setError(problem);
    if (inviteRequired && !fields.inviteCode.trim()) return setError('Enter your invite code.');
    run({
      username,
      password: fields.password,
      displayName: fields.displayName.trim() || undefined,
      inviteCode: fields.inviteCode.trim() || undefined,
    });
  };

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={submit} noValidate>
        <div className="auth__logo" aria-hidden="true">
          <LogoIcon size={28} />
        </div>
        <h1 className="auth__title">{isRegister ? 'Create an account' : 'Welcome back!'}</h1>
        <p className="auth__subtitle">
          {isRegister
            ? `Join your Huddle${maxUsers ? ` — up to ${maxUsers} members` : ''}.`
            : 'We’re so excited to see you again!'}
        </p>

        <Field
          label="Username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          hint={isRegister && '3–20 characters: letters, numbers and underscores.'}
          {...bind('username')}
        />
        {isRegister && (
          <Field
            label="Display name"
            optional
            maxLength={DISPLAY_NAME_MAX}
            hint="How others see you. Defaults to your username."
            {...bind('displayName')}
          />
        )}
        <Field
          label="Password"
          type="password"
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          hint={isRegister && 'At least 8 characters.'}
          {...bind('password')}
        />
        {/* Hidden only once the server confirms it doesn't need one. */}
        {isRegister && inviteRequired !== false && (
          <Field
            label="Invite code"
            optional={!inviteRequired}
            required={inviteRequired === true}
            autoComplete="off"
            hint={
              inviteRequired
                ? 'Ask the person who runs this server.'
                : 'Only needed if this server requires one.'
            }
            {...bind('inviteCode')}
          />
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn--primary btn--block" disabled={pending}>
          {pending ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
        </button>

        <p className="auth__switch">
          {isRegister ? 'Already have an account?' : 'Need an account?'}{' '}
          <button type="button" className="link-btn" onClick={switchMode}>
            {isRegister ? 'Log in' : 'Register'}
          </button>
        </p>
      </form>
    </main>
  );
}
