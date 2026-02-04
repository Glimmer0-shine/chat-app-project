# app.py
from flask import Flask, jsonify
from flask_cors import CORS  # Reactからのアクセスを許可するために必要

app = Flask(__name__)
CORS(app)

@app.route('/api/hello', methods=['GET'])
def hello():
    return jsonify({"message": "Python(Flask)からこんにちは！"})

if __name__ == '__main__':
    app.run(debug=True, port=5001)