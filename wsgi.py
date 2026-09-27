"""Production WSGI entry point: ``waitress-serve wsgi:app``."""

from src.backend.app import create_app

app = create_app()
