# 🍀 Y Talk (リアルタイムチャットアプリケーション)

## 📌 概要
『Y Talk』は、フロントエンドに **React**、バックエンド（BaaS）に **Supabase** を採用し、完全リアルタイムな双方向コミュニケーションを実現したモダンなチャットアプリケーションです。

---

## 🛠️ 主な機能 (Features)

### 1. 認証・セッション管理
* **セキュリティを考慮したサインアップ/サインイン**: 入力値の徹底したクリーンアップ（空白除去・小文字化）およびバリデーション。
* **選べるログイン維持設定**: 「ブラウザを閉じたら毎回ログアウト」「1ヶ月間維持」「6ヶ月間維持」から選択できる、ユーザーのセキュリティニーズに合わせた動的なセッション有効期限管理。長期間不使用のアカウントのセッション残存を排除し、アカウント乗っ取りの温床を作らない設計。

### 2. コミュニケーション機能
* **リアルタイム・トーク**: Supabase Realtime (BaaS) を利用した、リロード不要の即時メッセージ送受信。グループチャットにも対応。
* **共有カレンダー・アルバム・フォルダ**: Supabase Realtime (BaaS) を利用した、チャット以外の情報を共有できる便利機能。
* **連絡帳（友達管理）**: 他のユーザーを登録し、個別のチャットルーム（トーク）をシームレスに作成・管理する機能。

### 3. セキュリティ & 堅牢性設計
* **悪質ユーザーの即時排除**: ログイン中であっても、管理者がアカウントを論理削除（`is_deleted: true`）した瞬間に、次のアクション時またはセッション検証時に自動で強制ログアウトさせるBAN機能。
* **アカウント存在確認（ユーザー列挙）脆弱性の防御**: 新規登録時の二重登録エラーをフロント側で安易に露出させず、Supabaseの認証機構と連動して安全に処理。

---

## 📐 プロジェクト構成 (Project Composition)

本プロジェクトは、フロントエンドと Supabase を直接連携させることで、高速でリアルタイムなチャット機能を実現しています。

* **frontend/**: React + Supabase SDK (主要ロジック、リアルタイムリスナー)
* **backend/**: Python (Flask)
  * *注：現在はフロントエンドとSupabaseの連携で完結していますが、今後「AIによる会話要約」や「画像解析」などの高度な機能を実装するための拡張用基盤として用意しています。*

---

## ⚙️ 環境構築・動作方法 (Usage)

### 前提条件
* "react": "^19.2.4",
* Node.js (推奨: v18以上)


### 1. フロントエンドの準備

`frontend` ディレクトリ配下に、Supabaseとの接続に必要な環境変数ファイル `.env` を作成し、以下の通り鍵を設定してください。

```env
REACT_APP_SUPABASE_URL=あなたのSUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY=あなたのSUPABASE_ANON_KEY
```

### 2. Supabase のデータベース準備
ご自身のSupabaseプロジェクトの SQL Editor にて、以下のSQLを実行し、必要なテーブル、ストレージ、行レベルセキュリティ（RLS）の設定を行ってください。

```sql
-- ==========================================
-- 1. 拡張機能の有効化
-- ==========================================
create extension if not exists "uuid-ossp";

-- ==========================================
-- 2. テーブルの作成
-- ==========================================

-- profiles（プロフィール）
create table public.profiles (
  id uuid references auth.users(id) on update cascade on delete cascade primary key,
  email text not null unique,
  display_name text,
  avatar_url text,
  allow_email_search boolean default true,
  is_deleted boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- rooms（チャットルーム）
create table public.rooms (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  is_group boolean default false,
  pair_key text,
  created_by uuid,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- room_members（ルーム所属メンバー）
create table public.room_members (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references public.rooms(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  status text,
  is_hidden boolean default false,
  is_deleted boolean default false not null,
  invited_at timestamp with time zone,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (room_id, user_id)
);

-- messages（メッセージ）
create table public.messages (
  id bigint generated always as identity primary key,
  room_id uuid,
  "user" text,
  text text,
  is_system boolean default false,
  file_type text,
  file_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- friend_requests（友達申請）
create table public.friend_requests (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  status text not null check (status = any (array['pending'::text, 'accepted'::text, 'rejected'::text])),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (sender_id, receiver_id)
);

-- friends（友達リスト）
create table public.friends (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  friend_user_id uuid references public.profiles(id) on delete cascade,
  friend_email text not null references public.profiles(email) on update cascade,
  is_blocked boolean default false,
  is_hidden boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique (user_id, friend_email)
);

-- events（イベント・カレンダー）
create table public.events (
  id uuid default gen_random_uuid() primary key,
  room_id uuid not null,
  user_id uuid,
  title text not null,
  description text,
  event_date date not null,
  event_time time without time zone,
  color text,
  created_by_email text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ==========================================
-- 3. Supabase Realtime（リアルタイム通信）の有効化
-- ==========================================
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.friends;
alter publication supabase_realtime add table public.friend_requests;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.room_members;
alter publication supabase_realtime add table public.rooms;

-- ==========================================
-- 4. 行レベルセキュリティ (RLS) の有効化 ＆ ポリシー定義
-- ==========================================

-- --- profiles ---
alter table public.profiles enable row level security;

create policy "allow_select_profiles" on public.profiles
  for select
  to authenticated
  using (true);

create policy "allow_update_my_profile" on public.profiles
  for update
  to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- --- rooms ---
alter table public.rooms enable row level security;

create policy "allow_insert_rooms" on public.rooms
  for insert
  to authenticated
  with check (true);

create policy "allow_select_rooms" on public.rooms
  for select
  to authenticated
  using (
    id in (select rm.room_id from public.room_members rm where rm.user_id = auth.uid())
    or pair_key is not null
    or created_by = auth.uid()
  );

-- --- room_members ---
alter table public.room_members enable row level security;

create policy "allow_select_room_members" on public.room_members
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "allow_insert_room_members" on public.room_members
  for insert
  to authenticated
  with check (true);

create policy "allow_update_room_members" on public.room_members
  for update
  to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "allow_delete_room_members" on public.room_members
  for delete
  to authenticated
  using (user_id = auth.uid());

-- --- messages ---
alter table public.messages enable row level security;

create policy "allow_select_messages" on public.messages
  for select
  to authenticated
  using (
    room_id in (select rm.room_id from public.room_members rm where rm.user_id = auth.uid())
  );

create policy "allow_insert_messages" on public.messages
  for insert
  to authenticated
  with check (
    room_id in (select rm.room_id from public.room_members rm where rm.user_id = auth.uid())
  );

-- --- friend_requests ---
alter table public.friend_requests enable row level security;

create policy "Users can view their own involved requests" on public.friend_requests
  for select using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "Users can create their own requests" on public.friend_requests
  for insert with check (auth.uid() = sender_id);

create policy "Receivers can update request status" on public.friend_requests
  for update using (auth.uid() = receiver_id);

create policy "Receivers can delete requests" on public.friend_requests
  for delete using (auth.uid() = receiver_id);

-- --- friends ---
alter table public.friends enable row level security;

create policy "allow_select_my_friends" on public.friends
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "allow_insert_my_friends" on public.friends
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "allow_update_my_friends_status" on public.friends
  for update
  to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "allow_delete_my_friends" on public.friends
  for delete
  to authenticated
  using (user_id = auth.uid());

-- --- events ---
alter table public.events enable row level security;

create policy "allow_select_events" on public.events
  for select
  to authenticated
  using (
    room_id in (select rm.room_id from public.room_members rm where rm.user_id = auth.uid())
  );

create policy "allow_insert_events" on public.events
  for insert
  to authenticated
  with check (
    room_id in (select rm.room_id from public.room_members rm where rm.user_id = auth.uid())
  );

create policy "allow_update_events" on public.events
  for update
  to authenticated
  using (
    room_id in (select rm.room_id from public.room_members rm where rm.user_id = auth.uid())
  );

create policy "allow_delete_events" on public.events
  for delete
  to authenticated
  using (
    room_id in (select rm.room_id from public.room_members rm where rm.user_id = auth.uid())
  );

-- ==========================================
-- 5. カスタム関数 (Functions) および トリガー (Triggers)
-- ==========================================

-- A. 新規ユーザー登録時に自動でプロフィールを作成する関数とトリガー
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$function$;

-- 新規ユーザー作成時にプロフィールを自動作成させるトリガー（テスト時に有効化）
CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users 
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- B. ルームメンバーの情報を取得するRPC用の関数
CREATE OR REPLACE FUNCTION public.get_room_members(p_room_id uuid)
 RETURNS TABLE(user_id uuid, status text, profiles jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM room_members rm 
    WHERE rm.room_id = p_room_id 
    AND rm.user_id = auth.uid()
  ) THEN
    RETURN QUERY
    SELECT 
      rm.user_id,
      rm.status,
      jsonb_build_object(
        'display_name', p.display_name,
        'email', p.email,
        'avatar_url', p.avatar_url
      ) AS profiles
    FROM room_members rm
    JOIN profiles p ON rm.user_id = p.id
    WHERE rm.room_id = p_room_id;
  END IF;
END;
$function$;


-- C. 友達申請承認時の自動友達登録関数とトリガー
CREATE OR REPLACE FUNCTION public.handle_accepted_friend_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        INSERT INTO public.friends (user_id, friend_email, friend_user_id, is_blocked, is_hidden)
        VALUES (
            NEW.sender_id,
            (SELECT email FROM public.profiles WHERE id = NEW.receiver_id),
            NEW.receiver_id,
            false,
            false
        )
        ON CONFLICT (user_id, friend_email) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER on_friend_request_accepted
  AFTER UPDATE ON public.friend_requests
  FOR EACH ROW EXECUTE PROCEDURE public.handle_accepted_friend_request();


-- D. 友達削除時のクリーンアップ関数とトリガー
CREATE OR REPLACE FUNCTION public.handle_deleted_friend_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    DELETE FROM public.friend_requests
    WHERE (sender_id = OLD.user_id AND receiver_id = OLD.friend_user_id)
       OR (sender_id = OLD.friend_user_id AND receiver_id = OLD.user_id);
       
    RETURN OLD;
END;
$function$;

CREATE TRIGGER on_friend_deleted
  AFTER DELETE ON public.friends
  FOR EACH ROW EXECUTE PROCEDURE public.handle_deleted_friend_cleanup();

-- ==========================================
-- ストレージバケットの作成 (storage.buckets)
-- ==========================================

-- 1. avatars バケットの作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 2. chat-attachments バケットの作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- 3. shared-documents バケットの作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-documents', 'shared-documents', true)
ON CONFLICT (id) DO NOTHING;

-- 4. shared-folder バケットの作成
INSERT INTO storage.buckets (id, name, public)
VALUES ('shared-folder', 'shared-folder', true)
ON CONFLICT (id) DO NOTHING;


-- ==========================================
-- ストレージオブジェクト権限設定 (storage.objects)
-- ==========================================

-- 既存ポリシーがある場合の重複エラーを避けるため、再作成処理を実施

-- --- avatars 用ポリシー ---
CREATE POLICY "allow_select_avatars" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');


CREATE POLICY "allow_all_my_avatar" ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = (auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars' 
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- --- chat-attachments 用ポリシー ---
CREATE POLICY "storage_chat_attachments" ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'chat-attachments' 
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT rm.room_id FROM public.room_members rm WHERE rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'chat-attachments' 
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT rm.room_id FROM public.room_members rm WHERE rm.user_id = auth.uid()
    )
  );

-- --- shared-documents 用ポリシー ---
CREATE POLICY "storage_shared_documents" ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'shared-documents' 
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT rm.room_id FROM public.room_members rm WHERE rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'shared-documents' 
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT rm.room_id FROM public.room_members rm WHERE rm.user_id = auth.uid()
    )
  );

-- --- shared-folder 用ポリシー ---
CREATE POLICY "storage_shared_folder" ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'shared-folder' 
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT rm.room_id FROM public.room_members rm WHERE rm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'shared-folder' 
    AND ((storage.foldername(name))[1])::uuid IN (
      SELECT rm.room_id FROM public.room_members rm WHERE rm.user_id = auth.uid()
    )
  );
```

### 3. 起動手順
# 1. frontend ディレクトリへ移動
cd frontend

# 2. package.json に記載された依存ライブラリのインポート
npm install

# 3. 開発サーバーの起動
npm start