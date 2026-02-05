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

@app.route('/api/messages', methods=['GET'])
def get_messages():
    # 過去のメッセージを30件取得
    response = supabase.table('messages').select("*").order('created_at', desc=False).limit(30).execute()
    return jsonify(response.data)

@socketio.on('message')
def handle_message(data):
    # DBに保存
    new_message = {"text": data, "user": "Guest"} # 本来はログインユーザー名を入れる
    supabase.table('messages').insert(new_message).execute()
    
    # 全員に拡散
    emit('message', data, broadcast=True)


if __name__ == '__main__':
    socketio.run(app, debug=True, port=5001)