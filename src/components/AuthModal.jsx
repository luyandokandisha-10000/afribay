import React, { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';

/**
 * Maps Firebase Auth error codes to user-friendly error messages.
 */
function getFriendlyAuthErrorMessage(error) {
  if (!error) return '';
  console.error('[AfriBay Auth Error]', error);

  const code = error.code || '';
  const messages = {
    'auth/invalid-credential': 'Invalid email or password. Please check your credentials.',
    'auth/wrong-password': 'Invalid password. Please check your credentials.',
    'auth/user-not-found': 'No account found with this email. Please sign up first.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
    'auth/weak-password': 'Password is too weak. Please use at least 6 characters.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Sign-in popup was blocked by your browser. Please allow popups for Google sign-in.',
    'auth/unauthorized-domain': 'This domain is not authorized in Firebase Console.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase Console.',
    'auth/network-request-failed': 'Network connection error. Check your internet connection.',
    'auth/too-many-requests': 'Temporarily blocked due to many failed attempts. Try again later.'
  };

  if (messages[code]) return messages[code];
  if (error.message && !error.message.includes('Firebase:')) return error.message;
  return 'Authentication could not be completed. Please try again.';
}

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  // 1. Email / Password Login
  const handleSignIn = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (!auth) throw new Error('Firebase Auth is not initialized. Please verify src/firebase.js');
      const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      const user = {
        name: result.user.displayName || email.split('@')[0],
        email: result.user.email,
        firebaseUid: result.user.uid
      };
      if (onAuthSuccess) onAuthSuccess(user);
      if (onClose) onClose();
    } catch (err) {
      console.error('Sign In error:', err);
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // 2. Email / Password Sign Up
  const handleSignUp = async (e) => {
    if (e) e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      if (!auth) throw new Error('Firebase Auth is not initialized. Please verify src/firebase.js');
      const result = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      if (name && result.user) {
        try {
          await updateProfile(result.user, { displayName: name.trim() });
        } catch (pErr) {
          console.warn('Could not update profile display name:', pErr);
        }
      }
      const user = {
        name: name.trim(),
        email: result.user.email,
        firebaseUid: result.user.uid
      };
      if (onAuthSuccess) onAuthSuccess(user);
      if (onClose) onClose();
    } catch (err) {
      console.error('Sign Up error:', err);
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // 3. Google OAuth Login
  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      if (!auth) throw new Error('Firebase Auth is not initialized. Please verify src/firebase.js');
      const result = await signInWithPopup(auth, googleProvider);
      const user = {
        name: result.user.displayName || result.user.email?.split('@')[0] || 'Google User',
        email: result.user.email,
        firebaseUid: result.user.uid
      };
      if (onAuthSuccess) onAuthSuccess(user);
      if (onClose) onClose();
    } catch (err) {
      console.error('Google OAuth error:', err);
      setError(getFriendlyAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className="modal" style={{ maxWidth: '420px' }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{mode === 'signin' ? 'Welcome back' : 'Join the market'}</div>
            <h2>{mode === 'signin' ? 'Sign in to AfriBay' : 'Create your account'}</h2>
          </div>
          <button
            className="close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* User-friendly Error Alert Banner */}
        {error && (
          <div
            className="auth-error visible"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#fde8e8',
              color: '#9b1c1c',
              border: '1px solid #f8b4b4',
              fontSize: '13px',
              marginBottom: '14px',
              lineHeight: 1.4
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={mode === 'signin' ? handleSignIn : handleSignUp}>
          {mode === 'signup' && (
            <div className="form-row">
              <label htmlFor="authName">Your full name</label>
              <input
                id="authName"
                type="text"
                placeholder="e.g. Ama Mensah"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          )}

          <div className="form-row">
            <label htmlFor="authEmail">Email address</label>
            <input
              id="authEmail"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-row">
            <label htmlFor="authPassword">Password</label>
            <input
              id="authPassword"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          {/* Primary Submit Button */}
          <button
            className="button"
            type="submit"
            style={{ width: '100%', marginTop: '18px' }}
            disabled={loading}
          >
            {loading
              ? (mode === 'signin' ? 'Signing in...' : 'Creating account...')
              : (mode === 'signin' ? 'Sign in' : 'Create account →')}
          </button>
        </form>

        {/* Google OAuth Button */}
        <button
          className="button ghost"
          type="button"
          style={{ width: '100%', marginTop: '10px' }}
          onClick={handleGoogleSignIn}
          disabled={loading}
        >
          ◎ &nbsp; Sign in with Google
        </button>

        {/* Mode Switcher */}
        <p style={{ fontSize: '12px', color: 'var(--muted, #6b766e)', textAlign: 'center', marginTop: '16px', marginBottom: '4px' }}>
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button
                type="button"
                className="link-btn"
                style={{ padding: 0, textDecoration: 'underline', color: 'var(--green-deep, #0f4c3a)' }}
                onClick={() => { setMode('signup'); setError(''); }}
              >
                Create an account
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="link-btn"
                style={{ padding: 0, textDecoration: 'underline', color: 'var(--green-deep, #0f4c3a)' }}
                onClick={() => { setMode('signin'); setError(''); }}
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
