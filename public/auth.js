// Initialize Supabase Client
// NOTE: We need the URL and Key here on the frontend too for Auth.
// Ideally, these are injected via env vars during build, but for this prototype,
// we will use the values you provided.
const SUPABASE_URL = 'https://smiqyswcsrytwpudxhws.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNtaXF5c3djc3J5dHdwdWR4aHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMTI0MTUsImV4cCI6MjA3OTg4ODQxNX0.JZUEjxrGAejZZ_1fiM15laBullQBOIYSaA4xXAq6ge8'; // User needs to paste this here too for frontend auth

// Check if supabase script is loaded
if (typeof supabase === 'undefined') {
    console.error('Supabase SDK not loaded!');
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Signup Function
async function signUp(email, password) {
    const { data, error } = await sb.auth.signUp({
        email: email,
        password: password,
    });

    if (error) {
        alert('Signup Error: ' + error.message);
        return false;
    } else {
        alert('Signup Successful! Please check your email to verify (or login if auto-confirm is on).');
        window.location.href = 'login.html';
        return true;
    }
}

// Login Function
async function signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({
        email: email,
        password: password,
    });

    if (error) {
        alert('Login Failed: ' + error.message);
        return false;
    } else {
        // Save session (Supabase does this automatically in local storage)
        window.location.href = `tracker.html?t=${Date.now()}`;
        return true;
    }
}

// Check Session (for Dashboard)
async function checkSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
    } else {
        console.log('Logged in as:', session.user.email);
        // Store email for backend use
        localStorage.setItem('userEmail', session.user.email);

        // Dispatch event for script.js
        window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { email: session.user.email } }));

        // Trigger schedule load if on dashboard
        if (typeof loadExistingSchedule === 'function') {
            loadExistingSchedule();
        }
    }
}

// Logout
async function signOut() {
    await sb.auth.signOut();
    window.location.href = 'login.html';
}
