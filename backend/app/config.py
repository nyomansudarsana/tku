from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "tku-super-secret-key-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "sqlite:///./tku.db"
    APP_NAME: str = "Tech Kiosk Ubud"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    # Dev server bind address. HOST/PORT are only consumed by run.py's
    # auto-port-fallback launcher (see run.py) — not by uvicorn itself when
    # invoked directly via the CLI.
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    # Comma-separated list of allowed CORS origins, or "*" for all
    ALLOWED_ORIGINS: str = "*"

    class Config:
        env_file = ".env"


settings = Settings()
