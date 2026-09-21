"""Syio: Google OAuth authentication.

Call init_auth(app) from app.py to register login routes.
"""

import os
from flask import redirect, url_for, session
from authlib.integrations.flask_client import OAuth


def init_auth(app):
    """Register Google OAuth routes and configuration on the Flask app."""
    app.secret_key = os.getenv("SECRET_KEY", "fallback-dev-secret")

    oauth = OAuth(app)
    google = oauth.register(
        name='google',
        client_id=os.getenv('GOOGLE_CLIENT_ID'),
        client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
        server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
        client_kwargs={'scope': 'openid email profile'}
    )

    @app.route('/login')
    def login():
        redirect_uri = url_for('auth_callback', _external=True)
        return google.authorize_redirect(redirect_uri)

    @app.route('/auth/callback')
    def auth_callback():
        token = google.authorize_access_token()
        user_info = token.get('userinfo')
        if user_info:
            session['user'] = {
                'name': user_info.get('name'),
                'email': user_info.get('email'),
                'picture': user_info.get('picture')
            }
        return redirect('/dashboard')

    @app.route('/logout')
    def logout():
        session.pop('user', None)
        return redirect('/')
