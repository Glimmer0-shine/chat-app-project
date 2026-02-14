import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ctzifgdjkhsfsbvikvii.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0emlmZ2Rqa2hzZnNidmlrdmlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyODkyMTMsImV4cCI6MjA4NTg2NTIxM30.fuMBRZM5RxbFCP-phTahn7UScVV5FjbWmRIeCSC_Apg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
