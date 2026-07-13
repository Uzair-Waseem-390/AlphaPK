from pathlib import Path
from dotenv import load_dotenv
import os
from datetime import timedelta
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')
SECRET_KEY = os.getenv("SECRET_KEY")


DEBUG = os.getenv("DEBUG").lower() == "true"

def env_list(name):
    value = os.getenv(name)
    return [item.strip() for item in value.split(",")] if value else []

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")
BACKEND_URL = os.getenv("BACKEND_URL").rstrip("/")



INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    'whitenoise',
]

EXTERNAL_APPS = [
    'users',
    'purchases',
    'rates',
    'billing',
    'cash_flow',
    'ledger',
    'reports',
    'data_entry',
]

INSTALLED_APPS += EXTERNAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    "whitenoise.middleware.WhiteNoiseMiddleware",
    'django.contrib.sessions.middleware.SessionMiddleware',
    "corsheaders.middleware.CorsMiddleware",
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'



DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("DB_NAME"),
        "USER": os.getenv("DB_USER"),
        "PASSWORD": os.getenv("DB_PASSWORD"),
        "HOST": os.getenv("DB_HOST"),
        "PORT": os.getenv("DB_PORT"),
    }
}


AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]



LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Karachi'

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"


# ---- Custom user model ----
AUTH_USER_MODEL = "users.User"
 
# ---- DRF settings ----
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "backend.paginations.StandardResultsSetPagination",
}
 
# ---- SimpleJWT settings ----

 
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(days=10),  #only for development
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30), #only for development
    "ROTATE_REFRESH_TOKENS": True,           # new refresh token on every refresh call
    "BLACKLIST_AFTER_ROTATION": True,        # old refresh token is blacklisted after rotation
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "email",               # our PK is email, not id
    "USER_ID_CLAIM": "user_email",
}


MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'