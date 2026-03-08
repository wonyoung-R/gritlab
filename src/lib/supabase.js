import { createClient } from '@supabase/supabase-js'

// Supabase Anon Key는 공개용 키입니다. 실제 보안은 DB의 RLS Policy에서 처리됩니다.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mwitveudlafcrksokjtz.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13aXR2ZXVkbGFmY3Jrc29ranR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NzM5MDksImV4cCI6MjA4ODU0OTkwOX0.QYmGs8HWZuau3QUQOwL9VTj3IaaJL7Fw0c3Z6V1ocEw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
