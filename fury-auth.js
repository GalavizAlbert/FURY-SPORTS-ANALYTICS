import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, FURY_FUNCTION_NAME } from './fury-config.js';

const form = document.getElementById('furyLoginForm');
const emailInput = document.getElementById('furyEmail');
const passwordInput = document.getElementById('furyPassword');
const signInButton = document.getElementById('furySignIn');
const message = document.getElementById('furyAuthMessage');
const logoutButton = document.getElementById('furyLogout');
const accountEmail = document.getElementById('furyAccountEmail');
let client = null;
let authorized = false;
let initializedDashboard = false;
let authGeneration = 0;

function showMessage(text) { message.textContent = text || ''; }
function lockDashboard() {
  authorized = false;
  document.body.classList.remove('fury-authorized');
  accountEmail.textContent = '';
}
function friendlyError(error) {
  return error?.message || 'Unable to connect. Please try again.';
}
async function requestPrivateJSON(filename, accessToken) {
  if (!/^[a-z0-9_-]+\.json$/.test(filename)) throw new Error('Invalid data filename');
  const url = `${SUPABASE_URL}/functions/v1/${FURY_FUNCTION_NAME}?file=${encodeURIComponent(filename)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': SUPABASE_PUBLISHABLE_KEY
    },
    cache: 'no-store'
  });
  if (!response.ok) {
    let detail = '';
    try { const body = await response.json(); detail = body.error || body.message || ''; } catch (_) {}
    throw new Error(`Private data request failed (${response.status})${detail ? ': ' + detail : ''}`);
  }
  return response.json();
}
async function getToken() {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Please sign in again.');
  return data.session.access_token;
}
// Called by the dashboard's existing load(file) function.
window.furyPrivateLoad = async (filename) => {
  if (!authorized) throw new Error('Not authorized');
  return requestPrivateJSON(filename, await getToken());
};

async function authorizeSession(session) {
  const generation = ++authGeneration;
  lockDashboard();
  if (!session?.access_token) return;
  showMessage('Checking account approval...');
  try {
    // Server-side function verifies the token AND fury_members.active.
    await requestPrivateJSON('all_leagues_data.json', session.access_token);
    if (generation !== authGeneration) return;
    authorized = true;
    accountEmail.textContent = session.user?.email || '';
    document.body.classList.add('fury-authorized');
    showMessage('');
    if (!initializedDashboard) {
      if (typeof window.startFuryDashboard !== 'function') throw new Error('Dashboard initialization missing');
      initializedDashboard = true;
      window.startFuryDashboard();
    } else {
      // Reload current league after a fresh login.
      const leagueSelect = document.getElementById('leagueSelect');
      if (leagueSelect) leagueSelect.dispatchEvent(new Event('change'));
    }
  } catch (error) {
    if (generation !== authGeneration) return;
    lockDashboard();
    showMessage(friendlyError(error));
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!client) return;
  signInButton.disabled = true;
  showMessage('Signing in...');
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value
    });
    if (error) throw error;
    passwordInput.value = '';
    await authorizeSession(data.session);
  } catch (error) {
    lockDashboard();
    showMessage(friendlyError(error));
  } finally {
    signInButton.disabled = false;
  }
});
logoutButton.addEventListener('click', async () => {
  ++authGeneration;
  lockDashboard();
  showMessage('');
  if (client) await client.auth.signOut();
});

if (SUPABASE_PUBLISHABLE_KEY.startsWith('PASTE_')) {
  showMessage('Setup required: add your Supabase publishable key to fury-config.js.');
} else {
  try {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    await authorizeSession(data.session);
    client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        ++authGeneration;
        lockDashboard();
      }
      // TOKEN_REFRESHED does not require a new dashboard initialization.
    });
  } catch (error) {
    showMessage(friendlyError(error));
  }
}
