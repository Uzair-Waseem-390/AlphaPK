class BackendConfig {
    constructor() {
        this.baseURL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
        this.apiVersion = 'api/v1';
        this.timeout = 30000; // 30 seconds
        this.retryAttempts = 3;
        this.retryDelay = 1000;
    }

    getBaseURL() {
        return this.baseURL;
    }

    getAPIURL() {
        return `${this.baseURL}/${this.apiVersion}`;
    }

    getEndpoint(endpoint) {
        return `${this.getAPIURL()}/${endpoint}`;
    }

    getHeaders() {
        const token = localStorage.getItem('access_token');
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
        };
    }

    getTimeout() {
        return this.timeout;
    }

    getRetryConfig() {
        return {
            attempts: this.retryAttempts,
            delay: this.retryDelay,
        };
    }

    // Environment checks
    isDevelopment() {
        return import.meta.env.MODE === 'development';
    }

    isProduction() {
        return import.meta.env.MODE === 'production';
    }

    // WebSocket URL for real-time features
    getWebSocketURL() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = new URL(this.baseURL);
        return `${wsProtocol}//${url.host}`;
    }
}

// Export singleton instance
export const backendConfig = new BackendConfig();

// Export individual functions for convenience
export const getBaseURL = () => backendConfig.getBaseURL();
export const getAPIURL = () => backendConfig.getAPIURL();
export const getEndpoint = (endpoint) => backendConfig.getEndpoint(endpoint);
export const getHeaders = () => backendConfig.getHeaders();
export const getTimeout = () => backendConfig.getTimeout();