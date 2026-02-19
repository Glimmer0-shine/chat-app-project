import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Supabaseクライアントの初期化
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

@app.route('/messages', methods=['GET'])
def get_messages():
    # 過去のメッセージを30件取得
    response = supabase.table('messages').select("*").order('created_at', desc=False).limit(30).execute()
    return jsonify(response.data)

@socketio.on('message')
def handle_message(data):
    # dataは {'text': 'こんにちは', 'user': 'test@example.com'} という辞書形式で届く
    print(f"受信データ: {data}")
    
    try:
        # dataをそのままinsertに渡す（キー名がテーブルのカラム名と一致していればOK）
        result = supabase.table('messages').insert(data).execute()
    except Exception as e:
        print(f"DB保存エラー: {e}")
    
    emit('message', data, broadcast=True)


if __name__ == '__main__':
    socketio.run(app, debug=True, port=5001)