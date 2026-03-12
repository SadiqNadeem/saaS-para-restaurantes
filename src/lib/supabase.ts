import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ewxarutpvgelwdswjolz.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3eGFydXRwdmdlbHdkc3dqb2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTI5NzUsImV4cCI6MjA4NzAyODk3NX0.QySBgqT0RU63Z3M7aRMFfu-8J7UuCnrv4XQMTGCfx-c";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
