from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str = "tku-super-secret-key-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    DATABASE_URL: str = "sqlite:///./tku.db"
    APP_NAME: str = "Tech Kiosk Ubud"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    # Comma-separated list of allowed CORS origins, or "*" for all
    ALLOWED_ORIGINS: str = "*"

    class Config:
        env_file = ".env"


settings = Settings()
