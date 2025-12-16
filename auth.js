const INACTIVITY_TIMEOUT_MS = 1800000; // 30 minutos

let supabaseClient = null;
let currentUserId = null;
let currentUserEmail = null;
let inactivityTimer;
let onLoginCallback = () => {};
let onLogoutCallback = () => {};
let onInactivityLogoutCallback = () => {};

function handleInactivityLogout() {
    if (currentUserId) {
        onInactivityLogoutCallback();
        handleLogout();
    }
}

function resetInactivityTimer() {
    if (!currentUserId) return;
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(handleInactivityLogout, INACTIVITY_TIMEOUT_MS);
}

function setupInactivityListeners() {
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach(event => {
        document.addEventListener(event, resetInactivityTimer, false);
    });
}

export function getCurrentUserId() {
    return currentUserId;
}

export function getCurrentUserEmail() {
    return currentUserEmail;
}

export function initAuth(supabase, { onLogin, onLogout, onInactivityLogout }) {
    supabaseClient = supabase;
    onLoginCallback = onLogin;
    onLogoutCallback = onLogout;
    onInactivityLogoutCallback = onInactivityLogout;

    if (!supabaseClient) {
        console.error("Cliente Supabase não fornecido para o módulo de autenticação.");
        return;
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
        const user = session?.user;

        if (user) {
            currentUserId = user.id;
            currentUserEmail = user.email;

            const emailDisplay = document.getElementById('user-email-display');
            const idDisplay = document.getElementById('user-id-display');
            if (emailDisplay) emailDisplay.textContent = user.email || 'Anônimo';
            if (idDisplay) idDisplay.textContent = `ID: ${user.id}`;
            
            document.getElementById('auth-container').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            
            onLoginCallback(user);
            resetInactivityTimer();
        } else {
            currentUserId = null;
            currentUserEmail = null;
            clearTimeout(inactivityTimer);

            document.getElementById('auth-container').classList.remove('hidden');
            document.getElementById('app-container').classList.add('hidden');
            
            onLogoutCallback();
        }
    });

    setupInactivityListeners();
}

export async function handleAuth(email, password) {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");

    const submitButton = document.getElementById('login-button');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Entrando...';
    }

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
    } catch (error) {
        console.error("Erro de autenticação Supabase:", error);
        throw error; // Re-throw the error to be caught by the caller
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Entrar';
        }
    }
}

export async function handleLogout() {
    if (!supabaseClient) throw new Error("Supabase client not initialized.");
    
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
        clearTimeout(inactivityTimer);
    } catch (error) {
        console.error("Erro ao fazer logout:", error);
        throw error;
    }
}
