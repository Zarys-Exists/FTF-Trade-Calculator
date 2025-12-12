from flask import Flask, send_from_directory
import logging
import os

# Configure logging
root_logger = logging.getLogger()
if root_logger.handlers:
    for handler in root_logger.handlers:
        root_logger.removeHandler(handler)

handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s', '%H:%M:%S'))

root_logger.setLevel(logging.INFO)
root_logger.addHandler(handler)

logger = logging.getLogger(__name__)

# Disable Flask's default access logs
werkzeug_logger = logging.getLogger('werkzeug')
werkzeug_logger.disabled = True

# Create Flask app pointing to the static folder
app = Flask(__name__, static_folder='static', static_url_path='')

# Serve index.html as the main page
@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

# Serve ftf_items.json for item data
@app.route('/ftf_items.json')
def serve_items():
    return send_from_directory('.', 'ftf_items.json')

# Serve any other static files (CSS, JS, images)
@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    logger.info("Starting Trade Calculator at http://127.0.0.1:5000")
    app.run(debug=False, host='127.0.0.1', port=5000)
