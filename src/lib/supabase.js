import { createClient } from '@supabase/supabase-js'

// Supabase Anon Key는 공개용 키입니다. 실제 보안은 DB의 RLS Policy에서 처리됩니다.
// 2026-07-20: mwitveudlafcrksokjtz → aitqwjzcjyyxqvsosqyd (GRIT-LAB PJT, 서울) 이전
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://aitqwjzcjyyxqvsosqyd.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpdHF3anpjanl5eHF2c29zcXlkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0Nzk3NjUsImV4cCI6MjEwMDA1NTc2NX0.KhOBR3cv3WutbTLeWSWA7WK5m0VW9zOtRPn1It1VRsw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
