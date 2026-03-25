import os
from flask import Flask, jsonify
from flask_cors import CORS
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Supabaseクライアントの初期化（共通の土台として残す）
url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_KEY")
supabase: Client = create_client(url, key)

@app.route('/')
def index():
    return "Backend API is running. (Future extensibility for Image/AI processing)"

# 必要に応じて、過去の履歴取得APIだけ残しておいてもOKです
@app.route('/messages', methods=['GET'])
def get_messages():
    response = supabase.table('messages').select("*").order('created_at', desc=False).limit(30).execute()
    return jsonify(response.data)

if __name__ == '__main__':
    app.run(app, debug=True, port=5001)