/**
 * OpenRouter Management API Client
 * Provides access to credit balance and key management via management key
 */

const API_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter API Client
 */
class OpenRouterClient {
  /**
   * @param {string} managementKey - OpenRouter management API key
   */
  constructor(managementKey) {
    if (!managementKey) {
      throw new Error('OpenRouter management key is required');
    }
    this.managementKey = managementKey;
  }

  /**
   * Make an authenticated request to OpenRouter API
   * @param {string} endpoint - API endpoint path
   * @param {object} options - Fetch options
   * @returns {Promise<object>} API response
   */
  async _request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.managementKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenRouter API error (${response.status}): ${error.error?.message || response.statusText}`
      );
    }

    return response.json();
  }

  /**
   * Get credit balance information
   * Returns total credits purchased and total used
   * @returns {Promise<{totalCredits: number, totalUsage: number}>}
   */
  async getCredits() {
    const result = await this._request('/credits');
    return {
      totalCredits: result.data.total_credits,
      totalUsage: result.data.total_usage,
    };
  }

  /**
   * List API keys
   * @param {object} options - List options
   * @param {number} options.offset - Pagination offset
   * @param {number} options.limit - Max results (default 100)
   * @returns {Promise<Array>} List of API keys with usage data
   */
  async listKeys(options = {}) {
    const params = new URLSearchParams();
    if (options.offset) params.set('offset', options.offset.toString());
    if (options.limit) params.set('limit', options.limit.toString());
    
    const query = params.toString();
    const endpoint = `/keys${query ? `?${query}` : ''}`;
    
    const result = await this._request(endpoint);
    return result.data || [];
  }

  /**
   * Get a specific API key by hash
   * @param {string} keyHash - The key hash
   * @returns {Promise<object>} Key details
   */
  async getKey(keyHash) {
    const result = await this._request(`/keys/${keyHash}`);
    return result.data;
  }

  /**
   * Get usage for a specific generation (by ID from API response)
   * This allows fetching usage data after the fact
   * @param {string} generationId - The generation ID from chat completion response
   * @returns {Promise<object>} Generation details including usage
   */
  async getGeneration(generationId) {
    const result = await this._request(`/generations/${generationId}`);
    return result.data;
  }
}

module.exports = { OpenRouterClient };