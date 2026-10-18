import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, FURY_FUNCTION_NAME } from './fury-config.js';

const form = document.getElementById('furyLoginForm');
const emailInput = document.getElementById('furyEmail');
const passwordInput = document.getElementById('furyPassword');
const signInButton = document.getElementById('furySignIn');
const message = document.getElementById('furyAuthMessage');
const logoutButton = document.getElementById('furyLogout');
const accountEmail = document.getElementById('furyAccountEmail');
const accountMenu = document.getElementById('furyAccountMenu');
accountMenu.open = false;
const menuLabel = document.getElementById('furyMenuLabel');
const signedInMenu = document.getElementById('furySignedInMenu');
const signedOutMenu = document.getElementById('furySignedOutMenu');
function updateAccountMenu(signedIn) {
  signedInMenu.hidden = !signedIn;
  signedOutMenu.hidden = signedIn;
  menuLabel.textContent = signedIn ? 'My account' : 'Sign in';
}
let client = null;
let authorized = false;
let initializedDashboard = false;
let authGeneration = 0;
let currentToken = null;
const sessionJSONCache = new Map();

function showMessage(text) { message.textContent = text || ''; }
function lockDashboard() {
  authorized = false;
  currentToken = null;
  sessionJSONCache.clear();
  document.body.classList.remove('fury-authorized');
  accountEmail.textContent = '';
  updateAccountMenu(false);
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
  // Use the current session token; refresh it when Supabase rotates the JWT.
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Please sign in again.');
  if (currentToken !== data.session.access_token) {
    currentToken = data.session.access_token;
  }
  return currentToken;
}
// Called by the dashboard's existing load(file) function.
window.furyPrivateLoad = async (filename) => {
  if (!authorized) throw new Error('Not authorized');
  const token = await getToken();
  if (sessionJSONCache.has(filename)) {
    const cached = sessionJSONCache.get(filename);
    sessionJSONCache.delete(filename);
    return cached;
  }
  return requestPrivateJSON(filename, token);
};

async function authorizeSession(session) {
  const generation = ++authGeneration;
  lockDashboard();
  if (!session?.access_token) return;
  showMessage('Checking account approval...');
  try {
    // Server-side function verifies the token AND fury_members.active.
    // Verify server-side membership with a small file, not the large all-leagues dataset.
    const probeFile = 'la_liga_team_metrics.json';
    const probeData = await requestPrivateJSON(probeFile, session.access_token);
    if (generation !== authGeneration) return;
    currentToken = session.access_token;
    sessionJSONCache.set(probeFile, probeData);
    authorized = true;
    accountEmail.textContent = session.user?.email || '';
    updateAccountMenu(true);
    accountMenu.open = false;
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
  accountMenu.open = false;
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
      if (event === 'TOKEN_REFRESHED') {
        // Updated token will be read by getToken() on the next data request.
      }
    });
  } catch (error) {
    showMessage(friendlyError(error));
  }
}

// Close the account dropdown when clicking outside it.
document.addEventListener('click', (event) => {
  if (accountMenu.open && !accountMenu.contains(event.target)) accountMenu.open = false;
});

// Protected odds endpoint. The secret API key lives only in Supabase Edge Function secrets.
window.furyOddsRequest = async (league, refresh = false) => {
  if (!authorized) throw new Error('Please sign in');
  const token = await getToken();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/fury-odds?league=${encodeURIComponent(league)}${refresh ? "&refresh=1" : ""}`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_PUBLISHABLE_KEY },
    cache: 'no-store'
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
};


/* Authentication bridge for FURY Match Analysis AI */
window.furyAIAuth = async () => {
  if (!client || !authorized) {
    throw new Error('Please sign in with an approved FURY account.');
  }

  const token = await getToken();

  return {
    token,
    url: SUPABASE_URL,
    apikey: SUPABASE_PUBLISHABLE_KEY
  };
};
