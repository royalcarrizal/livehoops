// src/lib/supabase.js
//
// This file creates the connection between your app and Supabase — the
// backend service that stores user accounts and profile data.
//
// Think of Supabase as your app's "server in the cloud." It handles:
//   - User sign-up and login (authentication)
//   - Storing data in a database (like the profiles table)
//   - Keeping sessions alive so users stay logged in
//
// We use "environment variables" (the .env file) to store the Supabase URL
// and API key instead of writing them directly in the code. This is a
// security best practice — if you ever push this code to GitHub, the .env
// file is excluded by .gitignore so your keys stay private.

import { createClient } from '@supabase/supabase-js';

// import.meta.env is how Vite reads values from your .env file.
// The "VITE_" prefix is required — Vite only exposes env vars that
// start with VITE_ to the browser (for security).
const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// createClient() makes a Supabase client object — it's the single thing
// you import in other files whenever you need to talk to your database
// or authentication system. You only need one client for the whole app.
export const supabase = createClient(supabaseUrl, supabaseAnon);
