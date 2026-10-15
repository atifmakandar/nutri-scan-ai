import React, { useEffect, useId, useState } from 'react';
import './auth-photo.css';

const PASSWORD_MIN_LENGTH = 10;
const EMPTY_CREDENTIALS = Object.freeze({ username: '', password: '', farm_name: '' });
const EMPTY_MEMBER = Object.freeze({ username: '', password: '', role: 'member' });

const fallbackText = (value, values = {}) => String(value).replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, key) => (
  Object.hasOwn(values, key) && values[key] != null ? String(values[key]) : match
));

function text(t, value, values) {
  return typeof t === 'function' ? t(value, values) : fallbackText(value, values);
}

export const AUTH_PASSWORD_MIN_LENGTH = PASSWORD_MIN_LENGTH;

export function validatePassword(password) {
  return typeof password === 'string' && Array.from(password).length >= PASSWORD_MIN_LENGTH
    ? ''
    : 'Use at least 10 characters.';
}

export function validateAuthFields({ username, password, farm_name: farmName = '', createAccount = false } = {}) {
  if (typeof username !== 'string' || !username.trim()) return 'Username is required.';
  if (validatePassword(password)) return validatePassword(password);
  if (createAccount && (!farmName || !farmName.trim())) return 'Farm name is required.';
  return '';
}

export function isSessionResponse(value) {
  return Boolean(
    value && typeof value === 'object'
      && value.user && typeof value.user === 'object' && !Array.isArray(value.user)
      && value.farm && typeof value.farm === 'object' && !Array.isArray(value.farm),
  );
}

function safeErrorMessage(error, fallback, secrets = []) {
  const detail = Array.isArray(error?.detail)
    ? error.detail.map((item) => item?.msg || item?.message || '').filter(Boolean).join(', ')
    : error?.detail || error?.message || '';
  let message = typeof detail === 'string' ? detail : '';
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret) message = message.split(secret).join('[redacted]');
  }
  return message || fallback;
}

function roleLabel(role, t) {
  return text(t, role === 'owner' ? 'Owner' : role === 'viewer' ? 'Viewer' : 'Member');
}

async function requestApi(api, path, options = {}) {
  if (typeof api !== 'function') throw new Error('An API request function is required.');
  return api(path, { credentials: 'include', ...options });
}

/**
 * Parent integration contract:
 * - api(path, options) returns parsed JSON and rejects non-2xx responses with
 *   an error containing status/detail. It serializes object request bodies.
 * - The backend owns the HttpOnly session cookie; this component never stores
 *   credentials or tokens in browser storage.
 */
export default function AuthPanel({ api, session, onSession, t = fallbackText }) {
  const [mode, setMode] = useState('login');
  const [credentials, setCredentials] = useState(() => ({ ...EMPTY_CREDENTIALS }));
  const [memberForm, setMemberForm] = useState(() => ({ ...EMPTY_MEMBER }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [memberError, setMemberError] = useState('');
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberRevision, setMemberRevision] = useState(0);
  const id = useId();
  const hasSession = isSessionResponse(session);
  const owner = hasSession && session.user.role === 'owner';
  const viewer = hasSession && session.user.role === 'viewer';

  useEffect(() => {
    if (!owner) {
      setMembers([]);
      setMembersLoading(false);
      setMemberError('');
      return undefined;
    }

    let active = true;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    setMembersLoading(true);
    setMemberError('');
    Promise.resolve().then(() => requestApi(api, '/api/v1/members', { signal: controller?.signal })).then((value) => {
      if (!Array.isArray(value)) throw new Error('The server returned an invalid member list.');
      if (active) setMembers(value);
    }).catch((requestError) => {
      if (active && requestError?.name !== 'AbortError') {
        setMemberError(safeErrorMessage(requestError, 'Farm members could not be loaded.'));
      }
    }).finally(() => {
      if (active) setMembersLoading(false);
    });

    return () => {
      active = false;
      controller?.abort();
    };
  }, [api, owner, session?.user?.id, memberRevision]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
    setCredentials((current) => ({ ...current, password: '' }));
  }

  async function submitAuth(event) {
    event.preventDefault();
    const createAccount = mode === 'register';
    const validation = validateAuthFields({ ...credentials, createAccount });
    setError(validation);
    if (validation) return;

    const submitted = { ...credentials, username: credentials.username.trim() };
    const password = submitted.password;
    // Clear the controlled password field before any asynchronous work. The
    // request body remains only in this call stack long enough for api().
    setCredentials((current) => ({ ...current, password: '' }));
    setBusy(true);
    setError('');
    try {
      const returned = await requestApi(api, createAccount ? '/api/v1/auth/register' : '/api/v1/auth/login', {
        method: 'POST',
        body: createAccount
          ? { username: submitted.username, password, farm_name: submitted.farm_name.trim() }
          : { username: submitted.username, password },
      });
      const nextSession = isSessionResponse(returned)
        ? returned
        : await requestApi(api, '/api/v1/auth/me');
      if (!isSessionResponse(nextSession)) throw new Error('The server did not return a valid session.');
      onSession?.(nextSession);
      setCredentials({ ...EMPTY_CREDENTIALS });
    } catch (requestError) {
      setError(safeErrorMessage(
        requestError,
        createAccount ? 'Account could not be created.' : 'Sign in failed.',
        [password, submitted.username],
      ));
    } finally {
      setBusy(false);
      setCredentials((current) => ({ ...current, password: '' }));
    }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await requestApi(api, '/api/v1/auth/logout', { method: 'POST' });
      onSession?.(null);
      setCredentials({ ...EMPTY_CREDENTIALS });
      setMemberForm({ ...EMPTY_MEMBER });
    } catch (requestError) {
      setError(safeErrorMessage(requestError, 'Sign out failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitMember(event) {
    event.preventDefault();
    const validation = validateAuthFields({ ...memberForm, createAccount: false });
    setMemberError(validation);
    if (validation || !owner) return;

    const submitted = { ...memberForm, username: memberForm.username.trim() };
    const password = submitted.password;
    setMemberForm((current) => ({ ...current, password: '' }));
    setMemberBusy(true);
    setMemberError('');
    try {
      await requestApi(api, '/api/v1/members', {
        method: 'POST',
        body: { username: submitted.username, password, role: submitted.role },
      });
      setMemberForm({ ...EMPTY_MEMBER });
      setMemberRevision((value) => value + 1);
    } catch (requestError) {
      setMemberError(safeErrorMessage(requestError, 'Member could not be added.', [password, submitted.username]));
    } finally {
      setMemberBusy(false);
      setMemberForm((current) => ({ ...current, password: '' }));
    }
  }

  if (!hasSession) {
    const register = mode === 'register';
    return (
      <section className="auth-photo auth-panel" aria-labelledby={`${id}-title`} aria-busy={busy}>
        <div className="auth-photo-heading">
          <div>
            <p className="auth-photo-eyebrow">{text(t, 'Account')}</p>
            <h2 id={`${id}-title`}>{text(t, register ? 'Create farm account' : 'Sign in')}</h2>
          </div>
          <span className="auth-photo-badge">{register ? '01 / 02' : '01 / 01'}</span>
        </div>
        <div className="auth-photo-tabs" role="tablist" aria-label={text(t, 'Account')}>
          <button
            type="button"
            role="tab"
            aria-selected={!register}
            className={!register ? 'auth-photo-tab is-active' : 'auth-photo-tab'}
            onClick={() => changeMode('login')}
            disabled={busy}
          >{text(t, 'Sign in')}</button>
          <button
            type="button"
            role="tab"
            aria-selected={register}
            className={register ? 'auth-photo-tab is-active' : 'auth-photo-tab'}
            onClick={() => changeMode('register')}
            disabled={busy}
          >{text(t, 'Create farm account')}</button>
        </div>
        <form className="auth-photo-form" onSubmit={submitAuth} aria-label={text(t, register ? 'Create farm account' : 'Sign in')}>
          <label className="auth-photo-field" htmlFor={`${id}-username`}>{text(t, 'Username')}
            <input
              id={`${id}-username`}
              name="username"
              value={credentials.username}
              onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))}
              autoComplete="username"
               pattern="[a-z0-9][a-z0-9_.@+-]*"
              required
              disabled={busy}
            />
          </label>
          <label className="auth-photo-field" htmlFor={`${id}-password`}>{text(t, 'Password')}
            <input
              id={`${id}-password`}
              name="password"
              type="password"
              value={credentials.password}
              onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))}
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={PASSWORD_MIN_LENGTH}
              required
              disabled={busy}
            />
          </label>
          {register && <label className="auth-photo-field" htmlFor={`${id}-farm-name`}>{text(t, 'Farm name')}
            <input
              id={`${id}-farm-name`}
              name="farm_name"
              value={credentials.farm_name}
              onChange={(event) => setCredentials((current) => ({ ...current, farm_name: event.target.value }))}
              autoComplete="organization"
              required
              disabled={busy}
            />
          </label>}
          <p className="auth-photo-help">{text(t, 'Use at least 10 characters.')}</p>
          {error && <p className="auth-photo-feedback is-error" role="alert">{text(t, error)}</p>}
          <button className="primary-button auth-photo-submit" type="submit" disabled={busy}>
            {text(t, busy ? (register ? 'Creating account…' : 'Signing in…') : (register ? 'Create farm account' : 'Sign in'))}
          </button>
        </form>
        {register && <p className="auth-photo-switch">{text(t, 'Already have an account?')} <button className="text-button" type="button" onClick={() => changeMode('login')} disabled={busy}>{text(t, 'Back to sign in')}</button></p>}
      </section>
    );
  }

  return (
    <section className="auth-photo auth-panel" aria-labelledby={`${id}-title`} aria-busy={busy || membersLoading || memberBusy}>
      <div className="auth-photo-heading">
        <div>
          <p className="auth-photo-eyebrow">{text(t, 'Account')}</p>
          <h2 id={`${id}-title`}>{session.farm.name}</h2>
        </div>
        <button className="secondary-button" type="button" onClick={signOut} disabled={busy}>{text(t, 'Sign out')}</button>
      </div>
      <dl className="auth-photo-identity">
        <div><dt>{text(t, 'Username')}</dt><dd>{session.user.username}</dd></div>
        <div><dt>{text(t, 'Farm name')}</dt><dd>{session.farm.name}</dd></div>
        <div><dt>{text(t, 'Role')}</dt><dd>{roleLabel(session.user.role, t)}</dd></div>
      </dl>
      {error && <p className="auth-photo-feedback is-error" role="alert">{text(t, error)}</p>}
      {viewer && <p className="auth-photo-notice" role="status">{text(t, 'Viewer accounts cannot submit scans or upload photos.')}</p>}
      {owner && <div className="auth-photo-members">
        <div className="auth-photo-subheading"><h3>{text(t, 'Farm members')}</h3><span>{members.length}</span></div>
        <form className="auth-photo-form auth-photo-member-form" onSubmit={submitMember}>
          <label className="auth-photo-field" htmlFor={`${id}-member-username`}>{text(t, 'Username')}
           <input id={`${id}-member-username`} name="username" value={memberForm.username} onChange={(event) => setMemberForm((current) => ({ ...current, username: event.target.value }))} autoComplete="off" pattern="[a-z0-9][a-z0-9_.@+-]*" required disabled={memberBusy} />
          </label>
          <label className="auth-photo-field" htmlFor={`${id}-member-password`}>{text(t, 'Password')}
            <input id={`${id}-member-password`} name="password" type="password" value={memberForm.password} onChange={(event) => setMemberForm((current) => ({ ...current, password: event.target.value }))} autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required disabled={memberBusy} />
          </label>
          <label className="auth-photo-field" htmlFor={`${id}-member-role`}>{text(t, 'Role')}
            <select id={`${id}-member-role`} name="role" value={memberForm.role} onChange={(event) => setMemberForm((current) => ({ ...current, role: event.target.value }))} disabled={memberBusy}>
              <option value="member">{text(t, 'Member')}</option>
              <option value="viewer">{text(t, 'Viewer')}</option>
            </select>
          </label>
          {memberError && <p className="auth-photo-feedback is-error" role="alert">{text(t, memberError)}</p>}
          <button className="primary-button" type="submit" disabled={memberBusy}>{text(t, memberBusy ? 'Adding member…' : 'Add member')}</button>
        </form>
        {membersLoading && <p className="auth-photo-loading" role="status">{text(t, 'Loading members…')}</p>}
        {!membersLoading && !memberError && members.length === 0 && <p className="auth-photo-empty" role="status">{text(t, 'No members found.')}</p>}
        {members.length > 0 && <ul className="auth-photo-member-list">{members.map((member) => <li key={member.id || member.username}><span>{member.username}</span><span>{roleLabel(member.role, t)}</span></li>)}</ul>}
      </div>}
    </section>
  );
}
