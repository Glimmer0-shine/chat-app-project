from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO, emit

app = Flask(__name__)
CORS(app)
# SocketIOを初期化
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route('/')
def index():
    return "Socket.io Server is running"

# クライアントからメッセージを受け取った時の処理
@socketio.on('message')
def handle_message(data):
    print('received message: ' + data)
    # 全員にメッセージを投げ返す（拡散）
    emit('message', data, broadcast=True)

if __name__ == '__main__':
    # app.run ではなく socketio.run を使う
    socketio.run(app, debug=True, port=5001)